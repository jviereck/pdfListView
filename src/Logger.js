function Logger() {
    this.logLevel = Logger.INFO;
    var self = this;
    if (typeof(console) == "object" && typeof(console.log) == "function") {
        this.debug = function() {
            if (self.logLevel <= Logger.DEBUG) {
                console.log.apply(console, arguments);
            }
        };
        this.info = function() {
            if (self.logLevel <= Logger.INFO) {
                console.log.apply(console, arguments);
            }
        };
        this.error = function() {
            if (self.logLevel <= Logger.ERROR) {
                console.log.apply(console, arguments);
            }
        };
    } else {
        this.debug = this.info = this.error = function nop() {}
    }
}

Logger.DEBUG = 0;
Logger.INFO  = 1;
Logger.ERROR = 2;

