var libopus = require('../build/libopus.js').instance;

function stringifyError(errorId) {
  return libopus.Pointer_stringify(libopus._opus_strerror(errorId));
}

// Note that the opus documentation is not consistent with that 120ms
// that is suggested in the description of opus_decode. In other places
// such as the overview of the Opus Encoder, 60ms is used as the upper
// limit.
// To be on the safe side, 120ms has been choosen here.
var pcm_len = 4 /*Float32*/ * 2 /*channels*/ * 120 /*ms*/ * 48 /*samples/ms*/;
var data_len = 120 /*ms*/ * 512 /*bits per ms*/;

module.exports = {
  stringifyError: stringifyError,

  p_pcm: libopus._malloc(pcm_len),
  p_pcm_len: pcm_len,
  p_data: libopus._malloc(data_len),
  p_data_len: data_len
};
