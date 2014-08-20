module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.initConfig({
    browserify: {
      web: {
        files: {
          'web/web.js': ['lib/web.js']
        }
      }
    },
    uglify: {
      web: {
        files: {
          'web/web.min.js': ['web/web.js']
        }
      }
    }
  });

  grunt.registerTask('default', ['browserify', 'uglify']);

};
