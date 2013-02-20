require('shelljs/global');

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

    grunt.registerTask('deploy', 'Deploy the webpage to the gh-pages branch.', function() {
        exec('git push -f origin master:gh-pages');
    });

    grunt.registerTask('default', 'server');
}

