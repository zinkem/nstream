'use strict';

var streams = exports;

const net = require('net');
const { Transform,
        Writable,
        Readable,
        Duplex,
        PassThrough } = require('stream');

streams.PassThrough = PassThrough;

class Broadcaster extends Duplex {

  constructor() {
    super();
  }

  register(socket) {
    socket.pipe(this)
    this.pipe(socket);

    socket.on('end', () => {
      console.log('socket closed');
      socket.unpipe(this);
      this.unpipe(socket);
    });
  }

  _write(chunk, encoding, callback) {
    console.log(chunk.toString().trim());
    this.push(chunk.toString());
    callback();//null, chunk.toString());
  }

  _read(size) {
  }

}
streams.Broadcaster = Broadcaster;

//class WordCounter extends Duplex
class WordCounter extends Transform {
  constructor(opts) {
    super(opts)
    this.count = 0;
  }

  _transform(data, encoding, callback) {
    this.count += data.toString().split(' ').length
    callback(null, data);
  }
}
streams.WordCounter = WordCounter;

class ByteCounter extends Transform {

  constructor(opts) {
    super(opts)
    this.count = 0;
  }

  _transform(data, encoding, callback) {
    console.log(data, data.toString());
    this.count += data.length
    callback(null, data);
  }
}
streams.ByteCounter = ByteCounter;

class FilterStream extends Transform {
  constructor(opts, term) {
    super(opts)
    this.term = term;
    this.lines = 0;
    this.found = 0;
    this.invert_match = opts.invert_match || false;
  }

  _transform(data, encoding, callback) {
    this.lines++;
    var id = data.toString().indexOf(this.term);

    var fwd_data = ( id >= 0 ) ^ this.invert_match;

    if( fwd_data ) {
      this.found++;
      callback(null, data);
    } else {
      callback();
    }
  }
}
streams.FilterStream = FilterStream;

class StreamStamper extends Transform {
  constructor(opts, stamp) {
    super(opts)
    this.stamp = stamp;
  }
  _transform(data, encoding, callback) {
    callback(null, this.stamp+data);
  }

}
streams.StreamStamper = StreamStamper;

const { spawn } = require('child_process');

class ShellStream extends Duplex {
  constructor(opts, s) {
    super(opts)
    this.sock = s;
  }

  _write(data, encoding, callback) {
    if( data.toString().trim().length == 0 ) {
      this.push('no command\n');
      callback()
      return;
    }

    var self = this;

    var cmd = data.toString().trim().split(' ');
    console.log('command:', cmd);

    var p = spawn(cmd[0], cmd.splice(1));

    p.on('error', (err) => {
      self.push('error\n');
    });
    var next = new Writable({
      write(d, e, c) {
        self.push(d);
        c();
      }
    });

    p.stdout.pipe(next);
    p.stderr.pipe(next);
    callback();
  }

  _read(size) {

  }
}
streams.ShellStream = ShellStream;

class StreamLines extends Transform {
  constructor(opts, linebreak) {
    super(opts)
    this.linebreak = linebreak || '\n';
    this.buffer = '';
  }

  _transform(data, encoding, callback) {
    var lines = data.toString('utf8').split('\n');
    var cursor = this.buffer + lines.shift();

    while( cursor && cursor.indexOf('\r') >= 0 ) {
      this.push(cursor);
      cursor = lines.shift();
    }

    this.buffer = cursor;
    callback();
  }

  _flush(callback) {
    this.push(this.buffer+'\n');
    callback()
  }

}
streams.StreamLines = StreamLines;


class TagParser extends Writable {

  constructor(opts) {
    super(opts);
    this.buffer = '';
  }

  parseTag(raw) {
    let parsed = {};

    //console.log(raw, raw.substring(1,raw.length-1));
    let tokens = raw.substring(1,raw.length-1).split(' ');

    if( tokens[0].indexOf('!') === 0 ) {
      parsed.type = 'comment';
      parsed.name = tokens.shift().slice(1);
      parsed.text = tokens.join(' ');
    } else if( tokens[0].indexOf('/') === 0 ){
      parsed.type = 'close';
      parsed.name = tokens.shift().slice(1);
    } else {
      parsed.name = tokens.shift();
      parsed.type = 'open';
      for( let i in tokens ) {
        let parts = tokens[i].split('=');
        parsed[parts[0]] = parts[1];
      }
    }

    return parsed;
  }

  _write(data, encoding, callback) {
    this.buffer += data.toString('utf8');
    //console.log('new data', this.buffer);

    let start = this.buffer.indexOf('<');
    let end = this.buffer.indexOf('>')+1;
    while( start >= 0 && end >= 1 ){
      let new_tag = this.parseTag(this.buffer.substring(start, end));
      this.buffer = this.buffer.slice(end);
      //console.log(start, end);
      this.emit('xml_tag', new_tag);
      start = this.buffer.indexOf('<');
      end = this.buffer.indexOf('>')+1;
    }

    callback();
  }
}
streams.TagParser = TagParser;
