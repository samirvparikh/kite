var http = require('http');
var server = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    var message = 'It works!\n',
        version = 'NodeJS.. ' + process.versions.node + '\n',
        response = [message, version].join('\n');
    res.end(response);
});

const PORT = process.env.PORT;

server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});