'user strict';


const { TagParser } = require('./streams.js'),
      https = require('https'),
      http = require('http'),
      url = require('url'),
      zlib = require('zlib'),
      proc = require('process'),
      fs = require('fs');

let _file = fs.createWriteStream('./foo.txt');

let _visited = new Map();
let _visited_count = 0;
let log_visited = (target, status) => {

  if( !_responseStats.has(status) )
    _responseStats.set(status, { count: 0 });

  _responseStats.get(status).count++;
  
  _visited.set(target, status);
  //console.log(target, status, _visited.size + _links.size, _visited.size);
}

let _links = new Map();
let add_link = (target) => {

  let purl = url.parse(target);

  if( !_links.has(purl.host) )
    _links.set(purl.host, new Set())

  if( _links.get(purl.host).has(target) || _visited.has(target) ){
    return false;
  }
  _file.write(target+'\n');
  _links.get(purl.host).add(target);
  return true;
}

let _responseStats = new Map();
_responseStats.set(200, { count: 0 });

let seeds = [
  'http://zinkem.com',
  'https://www.reddit.com',
  'https://www.yahoo.com',
  'https://news.google.com',
  'https://news.google.com/news/?ned=us&gl=US&hl=en'
];


let _crawlAgent = new http.Agent({
  maxSockets: 1
});

let _crawlAgentS = new https.Agent({
  maxSockets: 1
});

_active_connections = 0;
let web_crawl = (target) => {

  let purl = url.parse(target);
  let new_link_count = 0;
  let dupe = 0;
  _active_connections++;

  let method = purl.protocol === 'http:' ? http : https;
  let agent = purl.protocol === 'http:' ? _crawlAgent : _crawlAgentS;
  
  let req_opts = {
    host: purl.host,
    protocol: purl.protocol,
    port: purl.protocol === 'http:' ? 80 : 443,
    path: purl.pathname,
    method: 'GET',
    agent: agent
  }
  //console.log(target, purl);
  let req = method.request(req_opts, (res) => {
    //console.log(target, 'response!', res.statusCode)
    log_visited(target, res.statusCode);
    
    if( res.statusCode !== 200 ) {
      if( res.statusCode === 302 ){
        //console.log(res.statusMessage, res.headers.location);
        // ## ADD LINK
        add_link(res.headers.location);
      } else {
        //console.error(target, res.statusCode, res.statusMessage);
      }
    }
    
    let saxparser = new TagParser({});

    saxparser.on('error', (err) => {
      console.error(`saxparser error ${err.message}`);
    });

    saxparser.on('xml_tag', (obj) => {
      let result = false;
      if( obj.name === 'a' && obj.type === 'open' ) {

        if( !obj.href ){
          //console.log('no href', obj);
          return;
        }
        
        let u = obj.href.replace(/"/g,'');

        if( !u.startsWith('http') ) {

          if( u.startsWith('javascript') ){
            //console.debug('ignoring js button');

          } else if( u.startsWith('#') ){
            //console.debug('ignoring internal link');

          } else if( u.startsWith('/') ){
            let new_link = purl.href + u.slice(1);

            // ## ADD LINK
            result = add_link(new_link);
          }

        } else {
          // ## ADD LINK
          result = add_link(u);
        }

        if( result ) new_link_count++;
        else dupe++;
      }
    });

    saxparser.on('finish', () => {
      //console.log(new_link_count, 'new links seen on', target, dupe, 'dupes');
    });

    res.on('end', () => {
      //console.log(target, 'NO error END END END END closing connection!');
      _active_connections--;
    });
    
    let tail = res;
    if( res.headers['content-encoding'] === 'gzip' ){
      tail = tail.pipe(zlib.createGunzip())
    }
    tail.pipe(saxparser);
    //tail.pipe(proc.stdout);
    
    
  });

  req.on('error', (e) => {
    if( !_responseStats.has(e.code) )
      _responseStats.set(e.code, { count: 0 });

    _responseStats.get(e.code).count++;
    
    //console.log(`${target} http.get error ${e.message}`);
    _active_connections--;
  });

  req.end();
}


seeds.forEach( x => web_crawl(x) );

let i_count = 0;


let iter = null;
setInterval(() => {

  let start = proc.hrtime()
  if( iter === null ){
    //console.log('new iter!');
    iter = _links.entries();
  }
  else {
    let n = iter.next();
    if( n.done && _links.size > 0) {
      //console.log('new iter!');
      iter = _links.entries();
    }
    //else 
      //console.log('resuming iter...', _links.size);
  }

  let label = i_count++;
  for( let domain of iter ){
    try {
      let d = domain[0];
      let c = domain[1].entries().next();
      
      //console.log(d, c);
      if( c.done ) {
        //console.log('Domain finished: ', d);
        _links.delete(d);
      } else {
        web_crawl(c.value.shift());
        _links.get(d).delete(c.value.shift());
      }
        
    } catch (e) {
      console.log(`INTERVAL: ${domain[0]} error ${e.message}`);

    }
    //console.log('INTERVAL active con', _active_connections);
    if( proc.hrtime(start)[1] > 1e6 ){
      console.debug('breakout!', iter.next());
      break;
    }
  }


  if( label % 100 === 0 ) {
    console.log('INTERVAL:', label,
                ', links visited:', _visited.size,
                ', domains recorded:', _links.size,
                ', active:', _active_connections,
                proc.hrtime(start),
                _responseStats.get(200).count / proc.uptime());
    console.log(_responseStats);
  }

}, 1);
