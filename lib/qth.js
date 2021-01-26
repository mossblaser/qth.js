"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _asyncMqtt = _interopRequireDefault(require("async-mqtt"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _createForOfIteratorHelper(o, allowArrayLike) { var it; if (typeof Symbol === "undefined" || o[Symbol.iterator] == null) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = o[Symbol.iterator](); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }

function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }

function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) { arr2[i] = arr[i]; } return arr2; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var Client = /*#__PURE__*/function () {
  /**
   * Connect to a Qth server.
   *
   * Parameters
   * ----------
   * url_or_mqtt_client
   *    A URL string (e.g. ws://server:8080) or alternatively an async-mqtt
   *    MQTT 'Client' object. If an async-mqtt Client, this must be configured
   *    to send a will of the form:
   *      {
   *        "topic": `meta/clients/${clientId}`,
   *        "payload": "",
   *        "qos": 2,
   *        "retain": true,
   *      }
   *    And to resubscribe on reconnect.
   * options
   *    An object containing options supported by the async-mqtt client along
   *    with the following additional options:
   *      * clientId: A string naming this client.
   *      * makeClientIdUnique: Bool. If true (the default) appends a random
   *        string to the chosen client id.
   *      * description: A string describing this client's purpose.
   */
  function Client(url_or_mqtt_client) {
    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, Client);

    this._clientId = options.clientId || "qth.js-client";
    delete options["clientId"]; // Uniquify name (if required)

    if (options.makeClientIdUnique || options.makeClientIdUnique === undefined) {
      this._clientId = "".concat(this._clientId, "-").concat(Math.random().toString(16).substr(2, 8));
    }

    delete options["makeClientIdUnique"];
    var description = options.description || "A Qth.js client."; // Remove Qth registration on disconnect

    options.will = {
      "topic": "meta/clients/".concat(this._clientId),
      "payload": "",
      "qos": 2,
      "retain": true
    }; // Resend subscriptions on reconnect

    options.resubscribe = true; // Don't make the broker maintain state while disconnected

    options.clean = true;

    if (typeof url_or_mqtt_client === "string") {
      this._client = _asyncMqtt["default"].connect(url_or_mqtt_client, options);
    } else {
      this._client = url_or_mqtt_client;
    }

    this._client.on("message", this._onMessage.bind(this));

    this._client.on("connect", this._onConnect.bind(this)); // The current set of subscriptions stored along with the last received
    // value. This is used to de-duplicate watches and to ensure new property
    // watches always receive the latest value immediately if already
    // connected. Each entry is an object {callbacks: [...], lastValue: ...}.


    this._watches = new Map(); // The registration information published to Qth.

    this._registration = {
      description: description,
      topics: {}
    }; // True if the registration has been changed and not yet sent to Qth

    this._registrationChanged = true; // While registration is in progress, a Promise which will resolve on
    // completion. If registration is not in progress, null.

    this._registrationOnComplete = null;
  }

  _createClass(Client, [{
    key: "_onConnect",
    value: function _onConnect() {
      this.sendRegistration();
    }
    /**
     * Internal use. Send the registration details, resending if it changes mid
     * transmission.
     */

  }, {
    key: "_sendRegistrationNow",
    value: function () {
      var _sendRegistrationNow2 = _asyncToGenerator(function* () {
        try {
          while (this._registrationChanged) {
            var registration = JSON.stringify(this._registration);
            this._registrationChanged = false;
            yield this._client.publish("meta/clients/".concat(this._clientId), registration, {
              qos: 2,
              retain: true
            });
          }
        } finally {
          this._registrationOnComplete = null;
        }
      });

      function _sendRegistrationNow() {
        return _sendRegistrationNow2.apply(this, arguments);
      }

      return _sendRegistrationNow;
    }()
    /**
     * Advanced users only. Trigger the re-sending of registration details (if
     * necesary).
     */

  }, {
    key: "sendRegistration",
    value: function sendRegistration() {
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

  }, {
    key: "register",
    value: function () {
      var _register = _asyncToGenerator(function* (path, behaviour, description) {
        var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
        this._registration.topics[path] = Object.assign({
          behaviour: behaviour,
          description: description
        }, options);
        return yield this.sendRegistration();
      });

      function register(_x, _x2, _x3) {
        return _register.apply(this, arguments);
      }

      return register;
    }()
    /**
     * Unregister a previously registered path.
     */

  }, {
    key: "unregister",
    value: function () {
      var _unregister = _asyncToGenerator(function* (path) {
        delete this._registration.topics[path];
        return yield this.sendRegistration();
      });

      function unregister(_x4) {
        return _unregister.apply(this, arguments);
      }

      return unregister;
    }()
    /**
     * Register callbacks on MQTT connection events.
     *
     * Supports the same callback types as async-mqtt.
     */

  }, {
    key: "on",
    value: function on(type, cb) {
      this._client.on(type, cb);
    }
    /**
     * Shutdown the client.
     */

  }, {
    key: "end",
    value: function end(force, callback) {
      this._watches.clear();

      this._client.end(force, callback);
    }
    /**
     * Internal use. Called on MQTT message arrival, passes it on the registered
     * watchers.
     *
     * Watchers are called with topic and message value as arguments. If the
     * message is empty undefined is passed, otherwise the deserialised JSON
     * message is passed.
     */

  }, {
    key: "_onMessage",
    value: function _onMessage(topicUint8Array, messageUint8Array) {
      var topic = topicUint8Array.toString();
      var message;

      if (messageUint8Array.length > 0) {
        message = JSON.parse(messageUint8Array.toString());
      } else {
        message = undefined;
      }

      if (this._watches.has(topic)) {
        var subscription = this._watches.get(topic);

        subscription.lastValue = message;

        var _iterator = _createForOfIteratorHelper(subscription.callbacks),
            _step;

        try {
          for (_iterator.s(); !(_step = _iterator.n()).done;) {
            var callback = _step.value;
            callback(topic, message);
          }
        } catch (err) {
          _iterator.e(err);
        } finally {
          _iterator.f();
        }
      }
    }
    /**
     * Internal use. Subscribe to a topic and call the supplied callback with two
     * arguments: topic and value when a message is received. If the message is
     * empty (e.g. for property deletion), the message will be undefined,
     * otherwise it will be the deserialised JSON value.
     *
     * The isProperty argument should be set to true for subscriptions to
     * properties (i.e. paths with retained values) to ensure that if multiple
     * subscriptions are registered, the last received value is returned.
     */

  }, {
    key: "_watch",
    value: function () {
      var _watch2 = _asyncToGenerator(function* (topic, callback, isProperty) {
        if (this._watches.has(topic)) {
          // Existing subscription
          var subscription = this._watches.get(topic);

          subscription.callbacks.push(callback);

          if (isProperty && subscription.lastValue !== undefined) {
            setTimeout(function () {
              return callback(topic, subscription.lastValue);
            }, 0);
          }
        } else {
          // New subscription
          this._watches.set(topic, {
            callbacks: [callback],
            lastValue: undefined
          });

          yield this._client.subscribe(topic, {
            qos: 2
          });
        }
      });

      function _watch(_x5, _x6, _x7) {
        return _watch2.apply(this, arguments);
      }

      return _watch;
    }()
    /**
     * Internal use. Unsubscribe a callback from a topic.
     */

  }, {
    key: "_unwatch",
    value: function () {
      var _unwatch2 = _asyncToGenerator(function* (topic, callback) {
        if (this._watches.has(topic)) {
          var subscription = this._watches.get(topic); // Remove callback from watch list


          var i = subscription.callbacks.indexOf(callback);

          if (i >= 0) {
            subscription.callbacks.splice(i, 1);
          } // Last one, remove the subscription too


          if (subscription.callbacks.length == 0) {
            this._watches["delete"](topic);

            yield this._client.unsubscribe(topic);
          }
        }
      });

      function _unwatch(_x8, _x9) {
        return _unwatch2.apply(this, arguments);
      }

      return _unwatch;
    }()
    /**
     * Watch a Qth event.
     *
     * When the event occurs, the provided callback will be called with the event
     * topic and value (deserialised into a Javascript object).
     */

  }, {
    key: "watchEvent",
    value: function () {
      var _watchEvent = _asyncToGenerator(function* (topic, callback) {
        return yield this._watch(topic, callback, false);
      });

      function watchEvent(_x10, _x11) {
        return _watchEvent.apply(this, arguments);
      }

      return watchEvent;
    }()
    /**
     * Stop watching a Qth event.
     */

  }, {
    key: "unwatchEvent",
    value: function () {
      var _unwatchEvent = _asyncToGenerator(function* (topic, callback) {
        return yield this._unwatch(topic, callback);
      });

      function unwatchEvent(_x12, _x13) {
        return _unwatchEvent.apply(this, arguments);
      }

      return unwatchEvent;
    }()
    /**
     * Send a Qth event with the given JSON-serialiseable value.
     */

  }, {
    key: "sendEvent",
    value: function () {
      var _sendEvent = _asyncToGenerator(function* (topic) {
        var value = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
        yield this._client.publish(topic, JSON.stringify(value), {
          qos: 2,
          retain: false
        });
      });

      function sendEvent(_x14) {
        return _sendEvent.apply(this, arguments);
      }

      return sendEvent;
    }()
    /**
     * Watch a Qth property.
     *
     * When the property value becomes known or changes, the provided callback
     * will be called with the topic and event value (deserialised into a
     * Javascript object). If the property is deleted, the callback will be
     * called with undefined as the property value.
     */

  }, {
    key: "watchProperty",
    value: function () {
      var _watchProperty = _asyncToGenerator(function* (topic, callback) {
        return yield this._watch(topic, callback, true);
      });

      function watchProperty(_x15, _x16) {
        return _watchProperty.apply(this, arguments);
      }

      return watchProperty;
    }()
    /**
     * Stop watching a Qth property.
     */

  }, {
    key: "unwatchProperty",
    value: function () {
      var _unwatchProperty = _asyncToGenerator(function* (topic, callback) {
        return yield this._unwatch(topic, callback);
      });

      function unwatchProperty(_x17, _x18) {
        return _unwatchProperty.apply(this, arguments);
      }

      return unwatchProperty;
    }()
    /**
     * Send a Qth property to the given JSON-serialiseable value.
     */

  }, {
    key: "setProperty",
    value: function () {
      var _setProperty = _asyncToGenerator(function* (topic, value) {
        yield this._client.publish(topic, JSON.stringify(value), {
          qos: 2,
          retain: true
        });
      });

      function setProperty(_x19, _x20) {
        return _setProperty.apply(this, arguments);
      }

      return setProperty;
    }()
    /**
     * Delete a Qth property.
     */

  }, {
    key: "deleteProperty",
    value: function () {
      var _deleteProperty = _asyncToGenerator(function* (topic) {
        yield this._client.publish(topic, "", {
          qos: 2,
          retain: true
        });
      });

      function deleteProperty(_x21) {
        return _deleteProperty.apply(this, arguments);
      }

      return deleteProperty;
    }()
  }]);

  return Client;
}();

var _default = Client;
exports["default"] = _default;