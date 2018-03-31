//import MQTT from "async-mqtt";
import MQTT from "async-mqtt";

let client = MQTT.connect("ws://localhost:8080");

client.on("connect", sayHi);

function sayHi() {
	console.log("Hi!!!");
}
