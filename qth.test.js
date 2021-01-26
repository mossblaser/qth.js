import Client from "./qth.js";

class MockMQTTClient {
  constructor() {
    this._callbacks = {};
    
    // A list of {args, resolve, reject} objects, one per call to publish.
    this.publishCalls = [];
    
    // A list of argument lists, one per call to subscribe/unsubscribe.
    this.subscribeCalls = [];
    this.unsubscribeCalls = [];
  }
  
  on(type, callback) {
    if (!this._callbacks[type]) {
      this._callbacks[type] = [];
    }
    this._callbacks[type].push(callback);
  }
  
  /**
   * Call a callback registered with 'on'.
   */
  call(type, ...args) {
    if (this._callbacks[type]) {
      for (const cb of this._callbacks[type]) {
        cb(...args);
      }
    }
  }
  
  publish(...args) {
    return new Promise((resolve, reject) => {
      this.publishCalls.push({args, resolve, reject});
    });
  }
  subscribe(...args) {
    return new Promise((resolve, reject) => {
      this.subscribeCalls.push(args);
      resolve();
    });
  }
  unsubscribe(...args) {
    return new Promise((resolve, reject) => {
      this.unsubscribeCalls.push(args);
      resolve();
    });
  }
}

function sleep(duration=1) {
	return new Promise(r => setTimeout(r, duration));
}

async function makeConnectedClient() {
  const mqtt = new MockMQTTClient();
  const c = new Client(mqtt, {clientId: "test-client", makeClientIdUnique: false});
  
  mqtt.call("connect");
  await sleep();
  mqtt.publishCalls.pop().resolve();
  
  return [mqtt, c];
}


describe("registration", function() {
  function validateRegistrationCall(call, expectedTopics) {
    // Check to see if the initial registration message was received
    expect(call.args).toHaveLength(3);
    expect(call.args[0]).toBe("meta/clients/test-client");
    expect(JSON.parse(call.args[1])).toEqual({
      description: "A Qth.js client.",
      topics: expectedTopics,
    });
    expect(call.args[2]).toEqual({
      qos: 2,
      retain: true,
    });
  }
  
  test("registration sent on connect", async function() {
    const mqtt = new MockMQTTClient();
    const c = new Client(mqtt, {clientId: "test-client", makeClientIdUnique: false});
    
    expect(mqtt.publishCalls).toHaveLength(0);
    mqtt.call("connect");
    
    // Initial registration sent
    expect(mqtt.publishCalls).toHaveLength(1);
    validateRegistrationCall(mqtt.publishCalls[0], {});
    mqtt.publishCalls[0].resolve();
    mqtt.publishCalls.pop();
  });
  
  test("single new registration", async function() {
    const [mqtt, c] = await makeConnectedClient();
    
    // New registrations should appear
    const regComplete = c.register("foo/prop", "PROPERTY-1:N", "A property");
    
    await sleep();
    expect(mqtt.publishCalls).toHaveLength(1);
    validateRegistrationCall(mqtt.publishCalls[0], {
      "foo/prop": {
        behaviour: "PROPERTY-1:N",
        description: "A property",
      }
    });
    mqtt.publishCalls[0].resolve();
    mqtt.publishCalls.pop();
    await regComplete;
  });
  
  test("many registrations", async function() {
    const [mqtt, c] = await makeConnectedClient();
    
    // A set of very closely spaced registrations (before the publish command
    // finishes) should be merged together (though the first should be sent
    // immediately).
    const regComplete1 = c.register("foo/evt1", "EVENT-1:N", "Event no. 1");
    await sleep();
    const regComplete2 = c.register("foo/evt2", "EVENT-1:N", "Event no. 2");
    await sleep();
    const regComplete3 = c.register("foo/evt3", "EVENT-1:N", "Event no. 3");
    await sleep();
    
    expect(mqtt.publishCalls).toHaveLength(1);
    validateRegistrationCall(mqtt.publishCalls[0], {
      "foo/evt1": {
        behaviour: "EVENT-1:N",
        description: "Event no. 1",
      },
    });
    mqtt.publishCalls[0].resolve();
    mqtt.publishCalls.pop();
    
    await sleep();
    expect(mqtt.publishCalls).toHaveLength(1);
    validateRegistrationCall(mqtt.publishCalls[0], {
      "foo/evt1": {
        behaviour: "EVENT-1:N",
        description: "Event no. 1",
      },
      "foo/evt2": {
        behaviour: "EVENT-1:N",
        description: "Event no. 2",
      },
      "foo/evt3": {
        behaviour: "EVENT-1:N",
        description: "Event no. 3",
      },
    });
    mqtt.publishCalls[0].resolve();
    mqtt.publishCalls.pop();
    
    await Promise.all([regComplete1, regComplete2, regComplete3]);
  });
  
  test("unregistration", async function() {
    const [mqtt, c] = await makeConnectedClient();
    
    // Register some things
    const r1 = c.register("foo/bar", "EVENT-1:N", "bar");
    await sleep();
    const r2 = c.register("foo/baz", "EVENT-1:N", "baz");
    await sleep();
    mqtt.publishCalls.pop().resolve();
    await sleep();
    mqtt.publishCalls.pop().resolve();
    await Promise.all([r1, r2]);
    
    // Unregistration should work
    const unregComplete = c.unregister("foo/baz");
    await sleep();
    
    await sleep();
    expect(mqtt.publishCalls).toHaveLength(1);
    validateRegistrationCall(mqtt.publishCalls[0], {
      "foo/bar": {
        behaviour: "EVENT-1:N",
        description: "bar",
      },
    });
    mqtt.publishCalls[0].resolve();
    mqtt.publishCalls.pop();
    
    await unregComplete;
  });
});


describe("events", function() {
  test("sending", async function() {
    const [mqtt, c] = await makeConnectedClient();
    const eventSent = c.sendEvent("foo/bar", [1,2,3]);
    
    await sleep();
    expect(mqtt.publishCalls).toHaveLength(1);
    expect(mqtt.publishCalls[0].args).toHaveLength(3);
    expect(mqtt.publishCalls[0].args[0]).toBe("foo/bar");
    expect(JSON.parse(mqtt.publishCalls[0].args[1])).toEqual([1,2,3]);
    expect(mqtt.publishCalls[0].args[2]).toEqual({qos: 2, retain: false});
    
    mqtt.publishCalls.pop().resolve();
    await eventSent;
  });
  
  test("watching and unwatching", async function() {
    const [mqtt, c] = await makeConnectedClient();
    
    const barEvents = []
    const barCb = (...a) => barEvents.push(a);
    await c.watchEvent("foo/bar", barCb);
    
    expect(mqtt.subscribeCalls).toHaveLength(1);
    expect(mqtt.subscribeCalls[0]).toEqual(["foo/bar", {qos: 2}]);

    mqtt.call("message", "foo/bar", "[1,2,3]");
    expect(barEvents).toHaveLength(1);
    expect(barEvents[0]).toEqual(["foo/bar", [1,2,3]]);
    
    // Duplicate watches should be allowed with no new subscriptions created
    const barEvents2 = []
    const barCb2 = (...a) => barEvents2.push(a);
    await c.watchEvent("foo/bar", barCb2);
    expect(mqtt.subscribeCalls).toHaveLength(1);
    
    mqtt.call("message", "foo/bar", "123");
    expect(barEvents).toHaveLength(2);
    expect(barEvents[1]).toEqual(["foo/bar", 123]);
    expect(barEvents2).toHaveLength(1);
    expect(barEvents2[0]).toEqual(["foo/bar", 123]);
    
    // Should be able to unwatch without unsubscribing
    await c.unwatchEvent("foo/bar", barCb);
    
    expect(mqtt.unsubscribeCalls).toHaveLength(0);
    
    mqtt.call("message", "foo/bar", "321");
    expect(barEvents).toHaveLength(2);
    expect(barEvents2).toHaveLength(2);
    expect(barEvents2[1]).toEqual(["foo/bar", 321]);
    
    // Unwatching remaining item should finally unsubscribe
    await c.unwatchEvent("foo/bar", barCb2);
    
    expect(mqtt.unsubscribeCalls).toHaveLength(1);
    expect(mqtt.unsubscribeCalls[0]).toEqual(["foo/bar"]);
  });
});


describe("properties", function() {
  test("setting", async function() {
    const [mqtt, c] = await makeConnectedClient();
    const propertySet = c.setProperty("foo/bar", [1,2,3]);
    
    await sleep();
    expect(mqtt.publishCalls).toHaveLength(1);
    expect(mqtt.publishCalls[0].args).toHaveLength(3);
    expect(mqtt.publishCalls[0].args[0]).toBe("foo/bar");
    expect(JSON.parse(mqtt.publishCalls[0].args[1])).toEqual([1,2,3]);
    expect(mqtt.publishCalls[0].args[2]).toEqual({qos: 2, retain: true});
    
    mqtt.publishCalls.pop().resolve();
    await propertySet;
  });
  
  test("deleting", async function() {
    const [mqtt, c] = await makeConnectedClient();
    const propertyDelete = c.deleteProperty("foo/bar");
    
    await sleep();
    expect(mqtt.publishCalls).toHaveLength(1);
    expect(mqtt.publishCalls[0].args).toEqual(
      ["foo/bar", "", {qos: 2, retain: true}]);
    
    mqtt.publishCalls.pop().resolve();
    await propertyDelete;
  });
  
  test("watching and unwatching", async function() {
    const [mqtt, c] = await makeConnectedClient();
    
    const barValues = []
    const barCb = (...a) => barValues.push(a);
    await c.watchProperty("foo/bar", barCb);
    
    expect(mqtt.subscribeCalls).toHaveLength(1);
    expect(mqtt.subscribeCalls[0]).toEqual(["foo/bar", {qos: 2}]);

    mqtt.call("message", "foo/bar", "[1,2,3]");
    expect(barValues).toHaveLength(1);
    expect(barValues[0]).toEqual(["foo/bar", [1,2,3]]);
    
    // Duplicate watches should be allowed with no new subscriptions created
    // but the last received value sent in next event loop iteration.
    const barValues2 = []
    const barCb2 = (...a) => barValues2.push(a);
    await c.watchProperty("foo/bar", barCb2);
    expect(mqtt.subscribeCalls).toHaveLength(1);
    
    expect(barValues2).toHaveLength(0);
    await sleep();
    expect(barValues2).toHaveLength(1);
    expect(barValues2[0]).toEqual(["foo/bar", [1,2,3]]);
    
    mqtt.call("message", "foo/bar", "123");
    expect(barValues).toHaveLength(2);
    expect(barValues[1]).toEqual(["foo/bar", 123]);
    expect(barValues2).toHaveLength(2);
    expect(barValues2[1]).toEqual(["foo/bar", 123]);
    
    // Should be able to unwatch without unsubscribing
    await c.unwatchProperty("foo/bar", barCb);
    
    expect(mqtt.unsubscribeCalls).toHaveLength(0);
    
    mqtt.call("message", "foo/bar", "321");
    expect(barValues).toHaveLength(2);
    expect(barValues2).toHaveLength(3);
    expect(barValues2[2]).toEqual(["foo/bar", 321]);
    
    // Unwatching remaining item should finally unsubscribe
    await c.unwatchProperty("foo/bar", barCb2);
    
    expect(mqtt.unsubscribeCalls).toHaveLength(1);
    expect(mqtt.unsubscribeCalls[0]).toEqual(["foo/bar"]);
  });
});
