/*jshint -W030*/

var expect = require('chai').expect;
var Transform = require('stream').Transform;
var Encoder = require('../lib/encoder.js');
var utils = require('../lib/utils.js');
var Application = Encoder.Application;

describe('Encoder', function() {
  describe('Encoder()', function () {
    it('should work without new', function () {
      expect(Encoder()).to.be.an.instanceof(Encoder);
    });
    it('should accept 1 or 2 channels', function() {
      expect(new Encoder({ channels: 1 })).to.be.ok;
      expect(new Encoder({ channels: 2 })).to.be.ok;
    });
    it('should not accept less than 1 or more than 2 channels', function() {
      expect(function(){ new Encoder({ channels: 0 });}).to.throw(/channel/);
      expect(function(){ new Encoder({ channels: 3 });}).to.throw(/channel/);
    });
    it('should accept 8k, 12k, 16k, 24k and 48k sampling rate', function() {
      [8000, 12000, 16000, 24000, 48000].forEach(function(rate) {
        expect(new Encoder({ rate: rate })).to.be.ok;
      });
    });
    it('should not accept invalid sampling rates', function() {
      expect(function(){ new Encoder({ rate: 42 });}).to.throw(/rate/);
      expect(function(){ new Encoder({ rate: 0 });}).to.throw(/rate/);
      expect(function(){ new Encoder({ rate: '123' });}).to.throw(/rate/);
    });
    it('should accept valid application types', function() {
      expect(new Encoder({ application: Application.VOIP })).to.be.ok;
      expect(new Encoder({ application: Application.AUDIO })).to.be.ok;
      expect(new Encoder({ application: Application.RESTRICTED_LOWDELAY })).to.be.ok;
    });
    it('should not accept invalid application types', function() {
      expect(function(){ new Encoder({ application: 123 });}).to.throw(/application/);
    });
  });
  describe('destroy', function() {
    it('should be a noop when unsafe mode is not enabled', function() {
      new Encoder({ unsafe: false }).destroy();
    });
    it('should cleanup when unsafe mode is enabled', function() {
      new Encoder({ unsafe: true }).destroy();
      // There isn't actually any good way to check this, so for now
      // we'll just assume that not throwing any error equals success
    });
  });
  describe('encode', function() {
    describe('with Float32Array', function() {
      it('should refuse arrays that are too large', function() {
        expect(function() {
          new Encoder().encode(new Float32Array(utils.p_pcm_len / 4 + 1));
        }).to.throw;
      });
      it('should error when array is empty', function() {
        expect(function() {
          new Encoder().encode(new Float32Array());
        }).to.throw;
      });
    });
    describe('with Int16Array', function() {
      it('should refuse arrays that are too large', function() {
        expect(function() {
          new Encoder().encode(new Int16Array(utils.p_pcm_len / 2 + 1));
        }).to.throw;
      });
      it('should error when array is empty', function() {
        expect(function() {
          new Encoder().encode(new Int16Array());
        }).to.throw;
      });
    });
    it('should refuse any types other than Int16-/Float32Array', function() {
      expect(function(){ new Encoder().encode("123"); }).to.throw;
      expect(function(){ new Encoder().encode([1, 2, 3]); }).to.throw;
      expect(function(){ new Encoder().encode(new Buffer(42)); }).to.throw;
      expect(function(){ new Encoder().encode(new ArrayBuffer(7)); }).to.throw;
    });
    // Due to the lack of small test vectors, this is currently missing tests
  });
  describe('stream', function() {
    it('should accept Int16 and Float32 modes', function() {
      expect(new Encoder().stream('Int16')).to.be.an.instanceof(Transform);
      expect(new Encoder().stream('Float32')).to.be.an.instanceof(Transform);
    });
    it('should not accept invalid modes', function() {
      expect(function(){ new Encoder().stream(); }).to.throw;
      expect(function(){ new Encoder().stream(123); }).to.throw;
      expect(function(){ new Encoder().stream('asd'); }).to.throw;
    });
    it('should produce a stream that calls #encode', function(done) {
      this.timeout(500);
      var enc = new Encoder();
      enc.encode = function(buf) {
        expect(buf).to.be.an.instanceof(Int16Array).and.have.lengthOf(1);
        expect(buf[0]).to.equal(0x0201);
        return Buffer.from([0x03, 0x04]);
      };
      var stream = enc.stream('Int16');
      stream.write(Buffer.from([0x01, 0x02]), function(err) {
        if (err) throw err;
        expect(stream.read()).to.deep.equal(Buffer.from([0x03, 0x04]));
        done();
      });
    });
  });
});
