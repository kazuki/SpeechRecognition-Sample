const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

const asr_path = path.resolve(__dirname, 'node_modules/asr-client/');
const dist_path = path.resolve(__dirname, 'dist');

module.exports = {
  mode: 'development',
  entry: './index.ts',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(asr_path, 'opus.wasm'),
          to: dist_path,
        },
        {
          from: path.resolve(asr_path, 'dist/vad-encoder.worklet.js'),
          to: dist_path,
        },
      ],
    }),
  ],
  output: {
    path: dist_path,
    filename: 'bundle.js',
  },
  devServer: {
    contentBase: path.resolve(__dirname, 'public'),
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
};
