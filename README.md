Qth.js
======

A Javascript library for implementing [Qth](https://github.com/mossblaser/qth)
clients.

Installation
------------

    $ npm install --save qth

Usage
-----

    import Client from "qth";
    const c = Client("ws://my-qth-server/");

    c.watchEvent("foo/bar", (topic, value) => {
      console.log("foo/bar fired with value", value);
    });

Tests
-----

    $ npm run test

