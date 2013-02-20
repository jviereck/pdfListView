module.exports = function(grunt) {
    grunt.registerTask('server', 'Start a static web server.', function(){
        var done = this.async();

        var port = 9996;
        var static = require('node-static');

        var file = new(static.Server)('./');
        require('http').createServer(function (request, response) {
            request.addListener('end', function () {
                file.serve(request, response);
            });
        }).listen(port);

        console.log('Starting a static web server on port: ' + port);
    });

    grunt.registerTask('default', 'server');
}

