var es = require('event-stream');
var glob = require('glob');
var minimatch = require('minimatch');
var path = require('path');

var isMatch = function(file, pattern) {
  if (typeof pattern === 'string') return minimatch(file, pattern);
  if (pattern instanceof RegExp) return pattern.test(file);
  return true; // unknown glob type?
};

var isNegative = function(pattern) {
  if (typeof pattern !== 'string') return true;
  if (pattern[0] === '!') return true;
  return false;
};

var isPositive = function(pattern) {
  return !isNegative(pattern);
};

module.exports = us = {
  // creates a stream for a single glob or filter
  createStream: function(ourGlob, negatives, opt) {
    if (!negatives) negatives = [];
    if (!opt) opt = {};
    if (typeof opt.cwd !== 'string') opt.cwd = process.cwd();
    if (typeof opt.silent !== 'boolean') opt.silent = true;
    if (typeof opt.nonull !== 'boolean') opt.nonull = false;

    // create globbing stuff
    var globber = new glob.Glob(ourGlob, opt);

    // create stream and map events from globber to it
    var stream = es.pause();
    globber.on('error', stream.emit.bind(stream, 'error'));
    globber.on('end', function(){
      stream.end();
    });
    globber.on('match', function(filename) {
      stream.write(path.join(opt.cwd, filename));
    });

    if (negatives.length === 0) return stream; // no filtering needed

    // stream to check against negatives
    var filterStream = es.map(function(filename, cb) {
      var matcha = function(pattern) {
        return isMatch(filename, pattern);
      };
      if (!negatives.every(matcha)) return cb(null, filename); // pass
      cb(); // ignore
    });

    return stream.pipe(filterStream);
  },

  // creates a stream for multiple globs or filters
  create: function(globs, opt) {
    // only one glob no need to aggregate
    if (!Array.isArray(globs)) return us.createStream(globs, null, opt);

    var positives = globs.filter(isPositive);
    var negatives = globs.filter(isNegative);

    if (positives.length === 0) throw new Error("Missing positive glob");

    // only one positive glob no need to aggregate
    if (positives.length === 1) return us.createStream(positives[0], negatives, opt);

    // create all individual streams
    var streams = positives.map(function(glob){
      return us.createStream(glob, negatives, opt);
    });
      
    // then just pipe them to a single stream and return it
    var aggregate = es.pause();
    streams.forEach(function(gStream){
      gStream.pipe(aggregate);
    });
    return aggregate;
  }
};
