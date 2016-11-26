module.exports = {
  Encoder: require('./lib/encoder.js'),
  Decoder: require('./lib/decoder.js'),
  libopus: require('./build/libopus.js').instance
};
