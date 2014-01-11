require('shelljs/global');

module.exports = function(grunt) {
    grunt.registerTask('server', 'Start a static web server.', function(){
        var done = this.async();

        var port = 9996;
        var static = require('node-static');

        var file = new(static.Server)('./');
        require('http').createServer(function (request, response) {
			file.serve(request, response);
        }).listen(port);

        console.log('Starting a static web server on port: ' + port);
    });

    grunt.registerTask('build', 'Bundles the JS files into one file and place it under build/', function() {
        exec('node build.js');
    });

    grunt.registerTask('gh-pages', 'Push to GitHub pages branch', function() {
        exec('git push -f origin master:gh-pages');
    });

    grunt.registerTask('deploy', 'Build and deploy the webpage to the gh-pages branch.', ['build', 'gh-pages']);
    grunt.registerTask('default', 'server');
};
