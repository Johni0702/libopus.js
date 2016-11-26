/*jshint -W030*/

var expect = require('chai').expect;
var Transform = require('stream').Transform;
var Decoder = require('../lib/decoder.js');
var utils = require('../lib/utils.js');

describe('Decoder', function() {
  describe('Decoder()', function () {
    it('should work without new', function () {
      expect(Decoder()).to.be.an.instanceof(Decoder);
    });
    it('should accept 1 or 2 channels', function() {
      expect(new Decoder({ channels: 1 })).to.be.ok;
      expect(new Decoder({ channels: 2 })).to.be.ok;
    });
    it('should not accept less than 1 or more than 2 channels', function() {
      expect(function(){ new Decoder({ channels: 0 });}).to.throw(/channel/);
      expect(function(){ new Decoder({ channels: 3 });}).to.throw(/channel/);
    });
    it('should accept 8k, 12k, 16k, 24k and 48k sampling rate', function() {
      [8000, 12000, 16000, 24000, 48000].forEach(function(rate) {
        expect(new Decoder({ rate: rate })).to.be.ok;
      });
    });
    it('should not accept invalid sampling rates', function() {
      expect(function(){ new Decoder({ rate: 42 });}).to.throw(/rate/);
      expect(function(){ new Decoder({ rate: 0 });}).to.throw(/rate/);
      expect(function(){ new Decoder({ rate: '123' });}).to.throw(/rate/);
    });
  });
  describe('destroy', function() {
    it('should be a noop when unsafe mode is not enabled', function() {
      new Decoder({ unsafe: false }).destroy();
    });
    it('should cleanup when unsafe mode is enabled', function() {
      new Decoder({ unsafe: true }).destroy();
      // There isn't actually any good way to check this, so for now
      // we'll just assume that not throwing any error equals success
    });
  });
  describe('decodeFloat32', function() {
    it('should handle lost packets', function() {
      var d = new Decoder();
      expect(d.decodeFloat32(5760)).to.have.lengthOf(5760);
      expect(d.decodeFloat32(null)).to.have.lengthOf(5760);
    });
    it('should error when data is invalid', function() {
      expect(function(){ new Decoder().decodeFloat32('asd'); }).to.throw(/data/);
      expect(function(){ new Decoder().decodeFloat32({}); }).to.throw(/data/);
    });
  });
  describe('decodeInt16', function() {
    it('should handle lost packets', function() {
      var d = new Decoder();
      expect(d.decodeInt16(5760)).to.have.lengthOf(5760);
      expect(d.decodeInt16(null)).to.have.lengthOf(5760);
    });
    it('should error when data is invalid', function() {
      expect(function(){ new Decoder().decodeInt16('asd'); }).to.throw(/data/);
      expect(function(){ new Decoder().decodeInt16({}); }).to.throw(/data/);
    });
  });
  describe('stream', function() {
    it('should accept Int16 and Float32 modes', function() {
      expect(new Decoder().stream('Int16')).to.be.an.instanceof(Transform);
      expect(new Decoder().stream('Float32')).to.be.an.instanceof(Transform);
    });
    it('should not accept invalid modes', function() {
      expect(function(){ new Decoder().stream(); }).to.throw;
      expect(function(){ new Decoder().stream(123); }).to.throw;
      expect(function(){ new Decoder().stream('asd'); }).to.throw;
    });
    it('should produce a stream that calls #decode', function(done) {
      this.timeout(500);
      var dec = new Decoder();
      dec.decodeInt16 = function(buf) {
        expect(buf).to.deep.equal(Buffer.from([0x01, 0x02]));
        return Int16Array.from([0x0403]);
      };
      var stream = dec.stream('Int16');
      stream.write(Buffer.from([0x01, 0x02]), function(err) {
        if (err) throw err;
        expect(stream.read()).to.deep.equal(Buffer.from([0x03, 0x04]));
        done();
      });
    });
  });
});
