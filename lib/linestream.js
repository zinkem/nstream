const { Transform } = require('stream');


class LineStream extends Transform {
  /**
     Aggregates buffers and breaks on a delimiter.
     newline, by default
  */
  constructor(opts, linebreak) {
    super(opts);
    this.linebreak = linebreak || '\n';
    this.buffer = '';
  }

  _transform(data, encoding, callback) {
    const input = this.buffer + data.toString('utf8');
    const lines = input.split('\n');
    this.buffer = lines.pop();
    while (lines.length > 0) {
      const line = lines.shift();
      this.push(line);
    }

    callback();
  }

  _flush(callback) {
    this.push(`${this.buffer}\n`);
    callback();
  }
}
module.exports = {
  LineStream
};
