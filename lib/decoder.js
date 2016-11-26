var libopus = require('../build/libopus.js').instance;
var utils = require('./utils');
var util = require('util');
var extend = require('extend');
var Transform = require('stream').Transform;
var e = function(msg) { return new Error(msg); };

var p_pcm = utils.p_pcm;
var p_data = utils.p_data;

/**
 * Decoder for opus streams.
 *
 * @param {object} [opts={}] - Options for the decoder
 * @param {(8000|12000|16000|24000|48000)} [opts.rate=48000] - Sampling rate of output signal (Hz)
 * @param {number} [opts.channels=1] - Number of (interleaved) channels
 * @param {boolean} [opts.unsafe=false] - Mark this decoder as unsafe.<br>
 *    Decoder in unsafe mode generally operate faster.<br>
 *    Warning: {@link #destroy()} MUST be called on an unsafe decoder before 
 *    it is garbage collected. Otherwise it will leak memory.
 * @constructor
 */
function Decoder(opts) {
  // Allow use without new
  if (!(this instanceof Decoder)) return new Decoder(opts);

  opts = extend({
    rate: 48000,
    channels: 1,
    unsafe: false
  }, opts);

  if (opts.channels < 1 || opts.channels > 2) {
    throw e("channels must be either 1 or 2");
  }
  if ([8000, 12000, 16000, 24000, 48000].indexOf(opts.rate) == -1) {
    throw e("rate can only be 8k, 12k, 16k, 24k or 48k");
  }

  this._rate = opts.rate;
  this._channels = opts.channels;
  this._unsafe = opts.unsafe;

  // Allocate space for the decoder state
  var size = libopus._opus_decoder_get_size(this._channels);
  var dec = libopus._malloc(size);
  // Initialize the decoder
  var ret = libopus._opus_decoder_init(dec, this._rate, this._channels);
  if (ret !== 0) {
    // Free allocated space and throw error
    libopus._free(dec);
    throw e(utils.stringifyError(ret));
  }
  // In unsafe mode, that's it. However in safe mode, we copy the state
  // to a local buffer and free our allocated memory afterwards
  if (this._unsafe) {
    this._state = dec;
  } else {
    this._state = libopus.HEAPU8.slice(dec, dec + size);
    libopus._free(dec);
  }
}

/**
 * Calls the specified function with the state loaded into memory.
 *
 * @param func - The function to be called
 * @returns The return value of func
 */
Decoder.prototype._withState = function(func) {
  if (this._unsafe) {
    // Unsafe mode already has the state stored in memory
    return func(this._state);
  } else {
    // Store state in memory
    var p = libopus._malloc(this._state.length);
    libopus.HEAPU8.set(this._state, p);

    // Call function
    try {
      return func(p);
    } finally {
      // Retrieve state from memory
      this._state.set(libopus.HEAPU8.subarray(p, p + this._state.length));
      libopus._free(p);
    }
  }
};

/**
 * Destroy this decoder.
 * This method should only be called if this decoder is in unsafe mode.
 * Any subsequent calls to any encode method will result in undefined behavior.
 */
Decoder.prototype.destroy = function() {
  if (this._unsafe) {
    libopus._free(this._state);
  }
};

/**
 * Decodes an opus packet and returns it as an Int16Array.
 * Packets have to be decoded in the same order they were encoded in and lost
 * packets must be indicated by passing the amount of lost samples as the data.
 * If more than 120ms of data are lost, calls to this method have to be split
 * in batches of at most 120ms. If a falsy value is passed in, the amount of 
 * lost samples is estimated with the last packet.
 *
 * @param {Buffer|number} data - Encoded input data or number of lost samples
 * @returns {Int16Array} The decoded output
 */
Decoder.prototype.decodeInt16 = function(data) {
  return new Int16Array(this._decode(data, 2, libopus._opus_decode));
};

/**
 * Decodes an opus packet and returns it as an Float32Array.
 * Packets have to be decoded in the same order they were encoded in and lost
 * packets must be indicated by passing the amount of lost samples as the data.
 * If more than 120ms of data are lost, calls to this method have to be split
 * in batches of at most 120ms. If a falsy value is passed in, the amount of 
 * lost samples is estimated with the last packet.
 *
 * @param {Buffer|number} data - Encoded input data or number of lost samples
 * @returns {Float32Array} The decoded output
 */
Decoder.prototype.decodeFloat32 = function(data) {
  return new Float32Array(this._decode(data, 4, libopus._opus_decode_float));
};

/**
 * Decode the input data and leave result on HEAP.
 *
 * @param {Buffer|number} data - Encoded input data
 * @param {number} bps - Bytes per sample
 * @param {function} doDecode - Opus decode function
 * @returns ArrayBuffer of decoded data
 */
Decoder.prototype._decode = function(data, bps, doDecode) {
  var self = this;
  return this._withState(function(p_dec) {
    data = data || self._getLastPacketDuration(p_dec);
    var ret;
    if (typeof data === 'number') {
      if (data * bps > utils.p_data_len) throw e('too much lost data');
      // Signal packet loss
      ret = doDecode(p_dec, 0, 0, p_pcm, data, 0);
    } else if (data instanceof Buffer) {
      if (data.length > utils.p_data_len) throw e('data array too large');
      // Decode input data
      libopus.HEAPU8.set(data, p_data);
      var maxFrameSize = utils.p_pcm_len / self._channels / bps;
      ret = doDecode(p_dec, p_data, data.length, p_pcm, maxFrameSize, 0);
    } else {
      // Invalid input data
      throw new TypeError('data must be number, Buffer or null');
    }
    // Handle result
    if (ret < 0) {
      throw e(utils.stringifyError(ret));
    }
    return libopus.HEAPU8.slice(p_pcm, p_pcm + ret * bps).buffer;
  });
};

/**
 * Get the duration of the last decoded or concealed packet.
 *
 * @returns {number} - Duration in samples
 */
Decoder.prototype.getLastPacketDuration = function() {
  return this._withState(this._getLastPacketDuration.bind(this));
};

Decoder.prototype._getLastPacketDuration = function(p_dec) {
  var p_res = libopus._malloc(4);
  var pp_res = libopus._malloc(4);
  try {
    libopus.HEAPU32[pp_res >> 2] = p_res;
    var err = libopus._opus_decoder_ctl(p_dec, 4039, pp_res);
    if (err) {
      throw e(utils.stringifyError(err));
    } 
    return libopus.HEAP32[p_res >> 2];
  } finally {
    libopus._free(pp_res);
    libopus._free(p_res);
  }
};

/**
 * Creates a transform stream from this decoder.
 * Lost packets should be indicated by an empty buffer. The length
 * of the lost packets will be estimated with the length of the last packet.
 *
 * @param [('Float32'|'Int16')] mode - Type of sample output
 * @returns {DecoderStream}
 */
Decoder.prototype.stream = function(mode) {
  return new DecoderStream(this, mode);
};

function DecoderStream(decoder, mode) {
  Transform.call(this, {});

  if (mode == 'Float32') {
    this._decode = decoder.decodeFloat32.bind(decoder);
  } else if (mode == 'Int16') {
    this._decode = decoder.decodeInt16.bind(decoder);
  } else {
    throw new TypeError('mode cannot be ' + mode);
  }
}
util.inherits(DecoderStream, Transform);

DecoderStream.prototype._transform = function(chunk, encoding, callback) {
  var result;
  try {
    var array = this._decode(chunk);
    result = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  } catch (err) {
    return callback(err);
  }
  callback(null, result);
};

Decoder.getNumberOfSamples = function(data, sampleRate) {
  if (!(data instanceof Buffer)) {
    // Invalid input data
    throw new TypeError('data must be a Buffer');
  }
  if (data.length > utils.p_data_len) throw e('data array too large');

  // Parse input data
  libopus.HEAPU8.set(data, p_data);
  var ret = libopus._opus_packet_get_nb_samples(p_data, data.length, sampleRate);

  // Handle result
  if (ret < 0) {
    throw e(utils.stringifyError(ret));
  }
  return ret;
};

module.exports = Decoder;
