var libopus = require('../build/libopus.js').instance;
var utils = require('./utils');
var util = require('util');
var extend = require('extend');
var Transform = require('stream').Transform;

/**
 * Encoding mode.
 * @readonly
 * @enum {number}
 */
var Application = {
  VOIP: 2048,
  AUDIO: 2049,
  RESTRICTED_LOWDELAY: 2051
};

var p_pcm = utils.p_pcm;
var p_data = utils.p_data;

/**
 * Encoder for opus streams.
 *
 * @param {object} [opts={}] - Options for the encoder
 * @param {(8000|12000|16000|24000|48000)} [opts.rate=48000] - Sampling rate of input signal (Hz)
 * @param {number} [opts.channels=1] - Number of (interleaved) channels
 * @param {Application} [opts.application=AUDIO] - Encoding mode
 * @param {boolean} [opts.unsafe=false] - Mark this encoder as unsafe.<br>
 *    Encoders in unsafe mode generally operate faster.<br>
 *    Warning: {@link #destroy()} MUST be called on an unsafe encoder before 
 *    it is garbage collected. Otherwise it will leak memory.
 * @constructor
 */
function Encoder(opts) {
  // Allow use without new
  if (!(this instanceof Encoder)) return new Encoder(opts);

  opts = extend({
    rate: 48000,
    channels: 1,
    application: Application.AUDIO,
    unsafe: false
  }, opts);

  if (opts.channels < 1 || opts.channels > 2) {
    throw "channels must be either 1 or 2";
  }
  if ([8000, 12000, 16000, 24000, 48000].indexOf(opts.rate) == -1) {
    throw "rate can only be 8k, 12k, 16k, 24k or 48k";
  }
  if (opts.application !== Application.VOIP &&
      opts.application !== Application.AUDIO &&
      opts.application !== Application.RESTRICTED_LOWDELAY) {
    throw "invalid application type";
  }

  this._rate = opts.rate;
  this._channels = opts.channels;
  this._application = opts.application;
  this._unsafe = opts.unsafe;

  // Allocate space for the encoder state
  var size = libopus._opus_encoder_get_size(this._channels);
  var enc = libopus._malloc(size);
  // Initialize the encoder
  var ret = libopus._opus_encoder_init(enc, this._rate, this._channels, this._application);
  if (ret !== 0) {
    // Free allocated space and throw error
    libopus._free(enc);
    throw utils.stringifyError(ret);
  }
  // In unsafe mode, that's it. However in safe mode, we copy the state
  // to a local buffer and free our allocated memory afterwards
  if (this._unsafe) {
    this._state = enc;
  } else {
    this._state = libopus.HEAPU8.slice(enc, enc + size);
    libopus._free(enc);
  }
}

/**
 * Calls the specified function with the state loaded into memory.
 *
 * @param func - The function to be called
 * @returns The return value of func
 */
Encoder.prototype._withState = function(func) {
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
 * Destroy this encoder.
 * This method should only be called if this encoder is in unsafe mode.
 * Any subsequent calls to any encode method will result in undefined behavior.
 */
Encoder.prototype.destroy = function() {
  if (this._unsafe) {
    libopus._free(this._state);
  }
};

/**
 * Encodes an array of (interleaved) pcm samples.
 * One frame must be exatly 2.5, 5, 10, 20, 40 or 60ms.
 *
 * @param {Int16Array|Float32Array} pcm - Input samples
 * @returns {Buffer} The encoded output
 */
Encoder.prototype.encode = function(pcm) {
  var samples = pcm.length / this._channels;
  return this._withState(function(p_enc) {
    var encode;
    if (pcm instanceof Float32Array) {
      if (pcm.length * 4 > utils.p_pcm_len) {
        throw new Error('pcm array too large');
      }
      libopus.HEAPF32.set(pcm, p_pcm >> 2);
      encode = libopus._opus_encode_float.bind(libopus);
    } else if (pcm instanceof Int16Array) {
      if (pcm.length * 2 > utils.p_pcm_len) {
        throw new Error('pcm array too large');
      }
      libopus.HEAP16.set(pcm, p_pcm >> 1);
      encode = libopus._opus_encode.bind(libopus);
    } else {
      throw new TypeError('pcm must be Int16Array or Float32Array');
    }
    var len = encode(p_enc, p_pcm, samples, p_data, utils.p_data_len);
    if (len < 0) {
      throw new Error(utils.stringifyError(len));
    }
    return Buffer.from(libopus.HEAPU8.subarray(p_data, p_data + len));
  });
};

/**
 * Creates a transform stream from this encoder.
 * Since the stream always receives a Buffer object, the actual sample
 * type has to be specified manually.
 *
 * @param [('Float32'|'Int16')] mode - Type of sample input
 * @returns {EncoderStream}
 */
Encoder.prototype.stream = function(mode) {
  return new EncoderStream(this, mode);
};

function EncoderStream(encoder, mode) {
  Transform.call(this, {});

  this._encoder = encoder;
  if (mode == 'Float32') {
    this._mode = Float32Array;
  } else if (mode == 'Int16') {
    this._mode = Int16Array;
  } else {
    throw new TypeError('mode cannot be ' + mode);
  }
}
util.inherits(EncoderStream, Transform);

EncoderStream.prototype._transform = function(chunk, encoding, callback) {
  chunk = new this._mode(chunk.buffer, chunk.byteOffset,
      chunk.byteLength / this._mode.BYTES_PER_ELEMENT);
  var result;
  try {
    result = this._encoder.encode(chunk);
  } catch (err) {
    return callback(err);
  }
  callback(null, result);
};

Encoder.Application = Application;
module.exports = Encoder;
