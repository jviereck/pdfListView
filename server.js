// Dump file server. Handles also `put` requests to store files on the disk.

var http = require('http');
var path = require("path");
var url = require("url");
var fs = require('fs');
var mime = require("mime");

var port = 9997;
var projectName = 'notr';
var rewriteRegExp = new RegExp('^/' + projectName);

function responseSuccess(res, obj) {
  res.writeHead(200, {"Content-Type": "application/json; charset=iso-8859-1"});
  res.end(JSON.stringify(obj), "binary");
}

var server = http.createServer(function (req, res) {
  var uri = url.parse(req.url).pathname;

  uri = uri.replace(rewriteRegExp, '');

  if (uri == "/") {
    uri = "index.html";
  }

  var filename = path.join(process.cwd(), uri);
  if (req.method == "PUT") {
    console.log("PUT", filename);
    var body = '';
    req.on('data', function(chunk) {
      body += chunk;
    });
    req.on('end', function() {
      fs.writeFile(filename, body, function(err) {
        if (err) {
          console.error("Failed to put file");
        }
        res.writeHead(200, {"Content-Type": "text/html; charset=iso-8859-1"});
        res.end("", "binary");
      });
    });
  } else if (req.method === "GET") {
    console.log("GET", filename);
    path.exists(filename, function(exists) {
      if(!exists) {
        res.writeHead(404, {"Content-Type": "text/plain; charset=iso-8859-1"});
        res.end("404 Not Found");
        return;
      }

      fs.readFile(filename, "binary", function(err, file) {
        if(err) {
          res.writeHead(500, {"Content-Type": "text/plain; charset=iso-8859-1"});
          res.end(err + "n");
          return;
        }

        var contentType = mime.lookup(filename) || "text/plain";
        res.writeHead(200, {"Content-Type": contentType + "; charset=utf-8"});
        res.end(file, "binary");
      });
    });
  } else {
    console.log("!!! Unhandled request method: ", req.method);
  }
}).listen(port, "127.0.0.1");

console.log("Up and running at %d", port);
