const path = require("path");

module.exports = {
	entry: "./Qth.js/index.js",
	output: {
		filename: "bundle.js",
		path: path.resolve(__dirname, "dist"),
	},
	devtool: "source-map",
};
