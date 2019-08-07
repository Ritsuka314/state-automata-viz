'use strict';

let nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'development',
  output: {
    // use absolute paths in sourcemaps (important for debugging via IDE)
    devtoolModuleFilenameTemplate: ' -- [absolute-resource-path]',
    devtoolFallbackModuleFilenameTemplate: ' -- [absolute-resource-path]?[hash]'
  },
  target: 'node',  // webpack should compile node compatible code
  externals: [nodeExternals()], // in order to ignore all modules in node_modules folder
  devtool: 'inline-cheap-module-source-map',
  resolve: {
    // changed from extensions: [".js", ".jsx"]
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      // copy files verbatim
      { test: /\.css$/,
        loader: 'file-loader',
        query: {
          name: '[path][name].[ext]'
        }
      },/*
      {
        test: /\.css$/,
        use: [{ loader: 'style-loader/url' }, { loader: 'file-loader' }],
      },*/
      { test: /\.[tj]sx?$/,
        loader: 'awesome-typescript-loader',
        exclude: '/node_modules/'
      },
      // addition - add source-map support
      { enforce: 'pre',
        test: /\.js$/,
        loader: 'source-map-loader',
        exclude: '/node_modules/'
      }
    ]
  },
};