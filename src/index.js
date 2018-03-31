//import MQTT from "async-mqtt";
import MQTT from "async-mqtt";

class Client {
  /**
   * Connect to a Qth server.
   *
   * Parameters
   * ----------
   * url_or_mqtt_client
   *    A URL string (e.g. ws://server:8080) or alternatively an async-mqtt
   *    MQTT 'Client' object.
   * options
   *    An object containing options supported by the async-mqtt client along
   *    with the following additional options:
   *      * clientId: A string naming this client.
   *      * makeClientIdUnique: Bool. If true (the default) appends a random
   *        string to the chosen client id.
   *      * description: A string describing this client's purpose.
   */
  constructor(url_or_mqtt_client, options={}) {
    this._clientId = options.clientId || "qth.js-client";
    delete options["clientId"];
    
    // Uniquify name (if required)
    if (options.makeClientIdUnique || options.makeClientIdUnique === undefined) {
      this._clientId = `${this._clientId}-${Math.random().toString(16).substr(2, 8)}`;
    }
    delete options["makeClientIdUnique"];
    
    const description = options.description || "A Qth.js client.";
    
    // Remove Qth registration on disconnect
    options.will = {
      "topic": `meta/clients/${this._clientId}`,
      "payload": "",
      "qos": 2,
      "retain": true,
    };
    
    // Resend subscriptions on reconnect
    options.resubscribe = true;
    
    // Don't make the broker maintain state while disconnected
    options.clean = true;
    
    if (typeof(url_or_mqtt_client) === "string") {
      this._client = MQTT.connect(url_or_mqtt_client, options);
    } else {
      this._client = url_or_mqtt_client;
    }
    
    this._client.on("message", this._onMessage.bind(this));
    this._client.on("connect", this._onConnect.bind(this));
    
    // The current set of subscriptions stored along with the last received
    // value. This is used to de-duplicate watches and to ensure new property
    // watches always receive the latest value immediately if already
    // connected. Each entry is an object {callbacks: [...], lastValue: ...}.
    this._watches = new Map();
    
    // The registration information published to Qth.
    this._registration = {
      description,
      topics: {}
    };
    
    // True if the registration has been changed and not yet sent to Qth
    this._registrationChanged = true;
    
    // While registration is in progress, a Promise which will resolve on
    // completion. If registration is not in progress, null.
    this._registrationOnComplete = null;
  }
  
  _onConnect() {
    this.sendRegistration();
  }
  
  /**
   * Internal use. Send the registration details, resending if it changes mid
   * transmission.
   */
  async _sendRegistrationNow() {
    try {
      while (this._registrationChanged) {
        const registration = JSON.stringify(this._registration);
        this._registrationChanged = false;
        
        await this._client.publish(
          `meta/clients/${this._clientId}`,
          registration,
          {qos: 2, retain: true});
      }
    } finally {
      this._registrationOnComplete = null;
    }
  }
  
  /**
   * Advanced users only. Trigger the re-sending of registration details (if
   * necesary).
   */
  sendRegistration() {
    this._registrationChanged = true;
    if (!this._registrationOnComplete) {
      this._registrationOnComplete = this._sendRegistrationNow();
    }
    return this._registrationOnComplete;
  }
  
  /**
   * Register a path with the Qth registrar.
   *
   * Parameters
   * ----------
   * path: A string giving the Qth path to register.
   * behaviour: One of:
   *    * "PROPERTY-1:N" (for one-to-many properties)
   *    * "PROPERTY-N:1" (for many-to-one properties)
   *    * "EVENT-1:N" (for one-to-many events)
   *    * "EVENT-N:1" (for many-to-one events)
   * description: A human readable description.
   * options: An object which may contain the following options:
   *    * "on_unsubscribe": The value to send or set (for events or properties
   *      respectively) when this client disconnects.
   *    * "delete_on_unregister": Properties only. Delete this property when
   *      this client disconnects.
   */
  async register(path, behaviour, description, options={}) {
    this._registration.topics[path] = {
      behaviour,
      description,
      ...options,
    };
    return await this.sendRegistration();
  }
  
  /**
   * Unregister a previously registered path.
   */
  async unregister(path) {
    delete this._registration.topics[path];
    return await this.sendRegistration();
  }
  
  /**
   * Register callbacks on MQTT connection events.
   *
   * Supports the same callback types as async-mqtt.
   */
  on(type, cb) {
    this._client.on(type, cb);
  }
  
  /**
   * Internal use. Called on MQTT message arrival, passes it on the registered
   * watchers.
   *
   * Watchers are called with the message value as the first argument followed
   * by the topic. If the message is empty undefined is passed, otherwise the
   * deserialised JSON message is passed.
   */
  _onMessage(topicUint8Array, messageUint8Array) {
    const topic = topicUint8Array.toString();
    let message
    if (messageUint8Array.length > 0) {
      message = JSON.parse(messageUint8Array.toString());
    } else {
      message = undefined;
    }
    
    if (this._watches.has(topic)) {
      const subscription = this._watches.get(topic);
      subscription.lastValue = message;
      for (const callback of subscription.callbacks) {
        callback(message, topic);
      }
    }
  }
  
  /**
   * Internal use. Subscribe to a topic and call the supplied callback with two
   * arguments: value and topic when a message is received. If the message is
   * empty (e.g. for property deletion), the message will be undefined,
   * otherwise it will be the deserialised JSON value.
   *
   * The isProperty argument should be set to true for subscriptions to
   * properties (i.e. paths with retained values) to ensure that if multiple
   * subscriptions are registered, the last received value is returned.
   */
  async _watch(topic, callback, isProperty) {
    if (this._watches.has(topic)) {
      // Existing subscription
      const subscription = this._watches.get(topic);
      subscription.callbacks.push(callback);
      if (isProperty && subscription.lastValue !== undefined) {
        setTimeout(() => callback(subscription.lastValue, topic), 0);
      }
    } else {
      // New subscription
      this._watches.set(topic, {
        callbacks: [callback],
        lastValue: undefined,
      });
      await this._client.subscribe(topic, {qos: 2});
    }
  }
  
  /**
   * Internal use. Unsubscribe a callback from a topic.
   */
  async _unwatch(topic, callback) {
    if (this._watches.has(topic)) {
      const subscription = this._watches.get(topic);
      
      // Remove callback from watch list
      const i = subscription.callbacks.indexOf(callback);
      if (i >= 0) {
        subscription.callbacks.splice(i, 1);
      }
      
      // Last one, remove the subscription too
      if (subscription.callbacks.length == 0) {
        this._watches.delete(topic);
        await this._client.unsubscribe(topic);
      }
    }
  }
  
  /**
   * Watch a Qth event.
   *
   * When the event occurs, the provided callback will be called with the event
   * value (deserialised into a Javascript object) and topic.
   */
  async watchEvent(topic, callback) {
    return await this._watch(topic, callback, false);
  }
  /**
   * Stop watching a Qth event.
   */
  async unwatchEvent(topic, callback) {
    return await this._unwatch(topic, callback);
  }
  /**
   * Send a Qth event with the given JSON-serialiseable value.
   */
  async sendEvent(topic, value=null) {
    await this._client.publish(topic, JSON.stringify(value), {qos: 2, retain: false});
  }
  
  /**
   * Watch a Qth event.
   *
   * When the property value becomes known or changes, the provided callback
   * will be called with the event value (deserialised into a Javascript
   * object) and topic. If the property is deleted, the callback will be called
   * with undefined as the property value.
   */
  async watchProperty(topic, callback) {
    return await this._watch(topic, callback, true);
  }
  /**
   * Stop watching a Qth property.
   */
  async unwatchProperty(topic, callback) {
    return await this._unwatch(topic, callback);
  }
  /**
   * Send a Qth property to the given JSON-serialiseable value.
   */
  async setProperty(topic, value) {
    await this._client.publish(topic, JSON.stringify(value), {qos: 2, retain: true});
  }
  /**
   * Delete a Qth property.
   */
  async deleteProperty(topic) {
    await this._client.publish(topic, "", {qos: 2, retain: true});
  }
}
