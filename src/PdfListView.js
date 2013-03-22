(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition()
  else if (typeof define == 'function' && define.amd) define(definition)
  else context[name] = definition()
})('PDFListView', this, function (name, context) {

//#expand __BUNDLE__

var logger = new Logger()

function _flat(arr) {
    var res = arr.reduce(function(a, b) {
        return a.concat(b);
    });
    return res;
}

function failDumper(err) {
    logger.error(err);
}

if (typeof(PDFJS) === "undefined") {
    logger.error("PDF.js is not yet loaded.");
} else {
    PDFJS.Promise.prototype.thenThis = function(scope, callback, errback, progressback) {
        return this.then(
            callback ? callback.bind(scope) : undefined,
            errback ? errback.bind(scope) : undefined,
            progressback ? progressback.bind(scope) : undefined
        );
    };
}

var css =
    ".plv-page-view {                   " +
    "  position: relative;              " +
    "}                                  " +
    ".plv-text-layer {                  " +
    "  position: absolute;              " +
    "  left: 0;                         " +
    "  top: 0;                          " +
    "  right: 0;                        " +
    "  bottom: 0;                       " +
    "  color: #000;                     " +
    "  font-family: sans-serif;         " +
    "  overflow: hidden;                " +
    "}                                  " +
    ".plv-text-layer > div {            " +
    "  color: transparent;              " +
    "  position: absolute;              " +
    "  line-height: 1;                  " +
    "  white-space: pre;                " +
    "  cursor: text;                    " +
    "}                                  " +
    ".plv-text-layer > div::selection { " +
    "  background:rgba(0,0,255,0.3);    " +
    "}                                  " +
    ".plv-text-layer > div::-moz-selection { " +
    "  background:rgba(0,0,255,0.3);         " +
    "}                                       ";
var scriptTag = document.createElement("style")
scriptTag.type = "text/css"
scriptTag.innerHTML = css;
document.head.appendChild(scriptTag);

// -----------------------------------------------------------------------------

/**
 * Wrapper around the raw PDF.JS document.
 */
function Document(url, password) {
    this.pdfDocument = null;
    this.pages = null;

    var parameters = {password: password};
    if (typeof url === 'string') { // URL
      parameters.url = url;
    } else if (url && 'byteLength' in url) { // ArrayBuffer
      parameters.data = url;
    }

    this.initialized = new PDFJS.Promise();
    PDFJS.getDocument(parameters).thenThis(this, this.loadPages, failDumper, this.onLoadProgress);
}

Document.prototype.loadPages = function(pdfDocument) {
    this.pdfDocument = pdfDocument;
    var pagesCount = this.pagesCount = pdfDocument.numPages;

    var pagePromises = [];
    for (var i = 1; i <= pagesCount; i++) {
        pagePromises.push(pdfDocument.getPage(i));
    }

    var pagesPromise = PDFJS.Promise.all(pagePromises);
    pagesPromise.thenThis(this, function(promisedPages) {
        this.pages = promisedPages.map(function(pdfPage) {
            return new Page(pdfPage);
        });

        this.initialized.resolve();
    }, failDumper);
};

Document.prototype.onLoadProgress = function() {
    this.initialized.progress.apply(this.initialized, arguments);
};

/**
 * Handles the rendering. Multiple ListViews can be bound to a RenderController.
 * In that case, the RenderController figures out what's page has the highest
 * priority to render
 */
function RenderController() {
    this.listViews = [];
    this.renderList = [];
}

RenderController.prototype = {
    addListView: function(listView) {
        // TODO: assert listView not already in list of this.listView
        this.listViews.push(listView);
    },

    updateRenderList: function() {
        this.renderList = _flat(this.listViews.map(function(listView) {
            return listView.getPagesToRender();
        }));

        // TODO: Some "highest-priority" sorting algorithm on the renderList.

        this.doRender();
    },

    pageToRender: function() {
        if (this.renderList.length === 0) return null;

        return this.renderList[0];
    },

    doRender: function() {
        var pageToRender = this.pageToRender();

        if (!pageToRender) return;

        pageToRender.render(this);
    },

    finishedRendering: function(pageView) {
        var idx = this.renderList.indexOf(pageView);

        // If the finished pageView is in the list of pages to render,
        // then remove it from the list and render start rendering the
        // next page.
        if (idx !== -1) {
            this.renderList.splice(idx, 1);
            this.doRender();
        }
    }
};

var LAYOUT_SINGLE = 'layout_single';
var SCALE_MODE_AUTO = 'scale_mode_auto';
var SCALE_MODE_VALUE = 'scale_mode_value';
var SCALE_MODE_FIT_WIDTH = 'scale_mode_fit_width';
var SCALE_MODE_FIT_HEIGHT = 'scale_mode_fit_height';

/**
 * Main view that holds the single pageContainer/pageViews of the pdfDoc.
 */
function ListView(dom) {
    this.dom = dom;

    this.pageLayout = LAYOUT_SINGLE;
    this.scaleMode = SCALE_MODE_VALUE;
    this.scale = 1.0;

    this.pageWidthOffset = 0;
    this.pageHeightOffset = 0;

    this.pageViews = [];
    this.containerViews = [];
}

ListView.prototype = {
    setDocument: function(pdfDoc) {
        this.clearPages()

        this.pdfDoc = pdfDoc;

        this.assignPagesToContainer();
        this.layout();
    },

    clearPages: function() {
        var self = this;
        this.containerViews.map(function(container) {
            self.dom.removeChild(container.dom);
        });
        this.pageViews = [];
        this.containerViews = [];
    },

    assignPagesToContainer: function() {
        // TODO: Handle multiple layout types here. For now, assume to have one page
        // per pageContainer.
        this.pdfDoc.pages.map(function(page) {
            var pageView = new PageView(page, this);
            this.pageViews.push(pageView);

            var container = new PageContainerView(this);
            container.setPageView(pageView, 0);
            this.containerViews.push(container);

            this.dom.appendChild(container.dom);
        }, this);
    },

    layout: function() {
        this.containerViews.forEach(function(containerView) {
            containerView.layout();
        });
    },

    getScale: function() {
        return this.scale
    },

    setScale: function(scale) {
        this.scaleMode = SCALE_MODE_VALUE;
        this.scale = scale;
        this.layout();
    },

    setToAutoScale: function() {
        this.scaleMode = SCALE_MODE_AUTO;
        this.calculateScale();
        this.layout();
    },

    setToFitWidth: function() {
        this.scaleMode = SCALE_MODE_FIT_WIDTH;
        this.calculateScale();
        this.layout();
    },

    setToFitHeight: function() {
        this.scaleMode = SCALE_MODE_FIT_HEIGHT;
        this.calculateScale();
        this.layout();
    },

    // Calculates the new scale. Returns `true` if the scale changed.
    calculateScale: function() {
        var newScale = this.scale;
        var oldScale = newScale;
        var scaleMode = this.scaleMode;
        if (scaleMode === SCALE_MODE_FIT_WIDTH || scaleMode === SCALE_MODE_AUTO) {
            var clientWidth = this.dom.clientWidth;
            var maxNormalWidth = 0;
            this.containerViews.forEach(function(containerView) {
                maxNormalWidth = Math.max(maxNormalWidth, containerView.normalWidth);
            });
            var scale = (clientWidth - this.pageWidthOffset)/maxNormalWidth;
            if (scaleMode === SCALE_MODE_AUTO) {
                scale = Math.min(1.0, scale);
            }
            newScale = scale;
        } else if (scaleMode === SCALE_MODE_FIT_HEIGHT) {
            var clientHeight = this.dom.clientHeight;
            var maxNormalHeight = 0;
            this.containerViews.forEach(function(containerView) {
                maxNormalHeight = Math.max(maxNormalHeight, containerView.normalHeight);
            });
            newScale = (clientHeight - this.pageHeightOffset)/maxNormalHeight;
        }
        this.scale = newScale;
        return newScale !== oldScale;
    },

    getPagesToRender: function() {
        // Cache these results to avoid dom access.
        this.scrollTop = this.dom.scrollTop;
        this.scrollBottom = this.scrollTop + this.dom.clientHeight;

        // TODO: For now, this only returns the visible pages and not
        // +1/-1 one to render in advance.
        return this.pageViews.filter(function(pageView) {
            var isVisible = pageView.isVisible();

            if (isVisible && !pageView.isRendered) {
                return true;
            }
        });
    }
};

/*
 * A PageContainerView holds multiple PageViews. E.g. in a two-page layout,
 * every pageContainerView holds two PageViews and is responsible to layout
 * them.
 */
function PageContainerView(listView) {
    this.listView = listView;

    var dom = this.dom = document.createElement('div');
    dom.className = 'plv-page-container page-container';
    this.pages = [];
}

PageContainerView.prototype = {
    setPageView: function(pageView, idx) {
        // TODO: handle case if there is already a page here
        this.pages[idx] = pageView;

        // TODO: handle page idx properly
        this.dom.appendChild(pageView.dom);
    },

    removePageView: function(idx) {
        // TODO: check if idx is set on page[]
        this.dom.removeChild(this.pages[idx].dom);
    },

    layout: function() {
        var scale = this.listView.scale;

        var normalWidth = 0;
        var normalHeight = 0;

        this.pages.forEach(function(pageView) {
            pageView.layout();
            normalWidth += pageView.normalWidth;
            normalHeight = Math.max(pageView.normalHeight, normalHeight);
        });

        this.normalWidth = normalWidth;
        this.normalHeight = normalHeight;

        this.dom.style.width = (normalWidth * scale) + 'px';
        this.dom.style.height = (normalHeight * scale) + 'px';
    }
};

var RenderingStates = {
  INITIAL: 0,
  RUNNING: 1,
  PAUSED: 2,
  FINISHED: 3
};

var idCounter = 0;

/**
 * The view for a single page.
 */
function PageView(page, listView) {
    this.page = page;
    this.listView = listView;
    this.id = idCounter++;
    this.number = this.page.number;

    this.rotation = 0;

    this.isRendered = false;
    this.renderState = RenderingStates.INITIAL;

    var dom = this.dom = document.createElement('div');
    dom.className = "plv-page-view page-view";
    this.createNewCanvas();
}

PageView.prototype = {
    layout: function() {
        var scale = this.listView.scale;

        var viewport = this.viewport =
            this.page.pdfPage.getViewport(scale, this.rotation);

        this.normalWidth = viewport.width / scale;
        this.normalHeight = viewport.height / scale;

        // Only change the width/height property of the canvas if it really
        // changed. Every assignment to the width/height property clears the
        // content of the canvas.
        var newWidth = Math.floor(viewport.width);
        var newHeight = Math.floor(viewport.height);
        if (this.canvas.width !== newWidth) {
            this.canvas.width = newWidth;
            this.resetRenderState();
        }
        if (this.canvas.height !== newHeight) {
            this.canvas.height = newHeight;
            this.resetRenderState();
        }

        this.width = viewport.width;
        this.height = viewport.height;
    },

    isVisible: function() {
        var listView = this.listView;
        var dom = this.dom;
        var offsetTop = dom.offsetTop;
        var offsetBottom = offsetTop + this.height;

        return offsetBottom >= listView.scrollTop &&
                offsetTop <= listView.scrollBottom;
    },

    resetRenderState: function() {
        this.renderState = RenderingStates.INITIAL;
        this.isRendered = false;
    },

    render: function(renderController) {
        return this.page.render(this, renderController);
    },

    getCanvasContext: function() {
        return this.canvas.getContext('2d');
    },

    createNewCanvas: function() {
        if (this.canvas) {
            this.dom.removeChild(this.canvas);
        }
        var canvas = this.canvas = document.createElement('canvas');
        this.dom.appendChild(canvas);
        this.layout();
    }
};

/**
 * An abstraction around the raw page object of PDF.JS, that also handles the
 * rendering logic of (maybe multiple) pageView(s) that are based on this page.
 */
function Page(pdfPage, number) {
    this.number = number;
    this.pdfPage = pdfPage;

    this.renderContextList = {};
}

Page.prototype = {
    render: function(pageView, renderController) {
        var renderContext;

        // FEATURE: If the page was rendered already once, then use the old
        // version as a placeholder until the new version is rendered at the
        // expected quality.

        // FEATURE: If the page can be rendered at low quality (thumbnail) and
        // there is already a higher resolution rendering, then use this one
        // instead of rerendering from scratch again.

        // PageView is not layouted.
        if (!pageView.viewport) return;

        // Nothing todo.
        if (pageView.isRendered) return;

        // Not most important page to render ATM.
        if (renderController.pageToRender() !== pageView) return;

        var self = this;
        var viewport;
        if (renderContext = this.renderContextList[pageView.id]) {
            viewport = renderContext.viewport;

            // TODO: handle rotation
            if (viewport.height !== pageView.viewport.height ||
                viewport.height !== pageView.viewport.height)
            {
                // The viewport changed -> need to rerender.
                renderContext.abandon = true;
                delete self.renderContextList[pageView.id];
                pageView.createNewCanvas();
                self.render(pageView, renderController);
            } else if (renderContext.state === RenderingStates.PAUSED) {
                // There is already a not finished renderState ->
                logger.debug('RESUME', pageView.id);
                renderContext.resume();
            }
        }

        if (!renderContext) {
            viewport = pageView.viewport;
            // No rendering data yet -> create a new renderContext and start
            // the rendering process.

            textLayerDiv = document.createElement("div")
            textLayerDiv.className = 'plv-text-layer text-layer';
            pageView.dom.appendChild(textLayerDiv);
            textLayer = new TextLayerBuilder(textLayerDiv)
            this.pdfPage.getTextContent().then(
              function(textContent) {
                textLayer.setTextContent(textContent);
              }
            );

            renderContext = {
              canvasContext: pageView.getCanvasContext(),
              viewport: viewport,
              textLayer: textLayer,
              continueCallback: function pdfViewContinueCallback(cont) {
                if (renderContext.abandon) {
                  logger.debug("ABANDON", pageView.id);
                  return;
                }

                if (renderController.pageToRender() !== pageView) {
                  logger.debug('PAUSE', pageView.id);
                  renderContext.state = RenderingStates.PAUSED;
                  renderContext.resume = function resumeCallback() {
                    renderContext.state = RenderingStates.RUNNING;
                    cont();
                  };
                  return;
                }
                logger.debug('CONT', pageView.id);
                cont();
              }
            };
            this.renderContextList[pageView.id] = renderContext;

            logger.debug("BEGIN", pageView.id);
            renderContext.renderPromise = this.pdfPage.render(renderContext);
            renderContext.renderPromise.then(
              function pdfPageRenderCallback() {
                logger.debug('DONE', pageView.id);
                pageView.isRendered = true;
                renderController.finishedRendering(pageView);
              },
              failDumper
            );
        }

        return renderContext.renderPromise;
    }
};

function PDFListView(mainDiv, options) {
    if (typeof(options) != "object") {
        options = {}
    }
    if (typeof(options.logLevel) != "number") {
        options.logLevel = Logger.INFO;
    }
    logger.logLevel = options.logLevel;

    this.listView = new ListView(mainDiv);

    this.renderController = new RenderController();
    this.renderController.addListView(this.listView);
    this.renderController.updateRenderList();

    var self = this;

    mainDiv.addEventListener('scroll', function() {
        // This will update the list AND start rendering if needed.
        self.renderController.updateRenderList();
    });

    window.addEventListener('resize', function() {
        // Check if the scale changed due to the resizing.
        if (self.listView.calculateScale()) {
            // Update the layout and start rendering. Changing the layout
            // of the PageView makes it rendering stop.
            self.listView.layout();
            self.renderController.updateRenderList();
        }
    });
};

PDFListView.prototype = {
    loadPdf: function(url) {
        this.doc = new Document(url);
        var self = this;
        var promise = this.doc.initialized
        promise.then(function() {
            logger.debug('loaded');
            self.listView.setDocument(self.doc);
            self.renderController.updateRenderList();
        }, failDumper);
        return promise;
    },

    getScale: function() {
        return this.listView.getScale();
    },

    setScale: function(scale) {
        this.listView.setScale(scale);
        this.renderController.updateRenderList();
    },

    setToAutoScale: function() {
        this.listView.setToAutoScale();
        this.renderController.updateRenderList();
    },

    setToFitWidth: function() {
        this.listView.setToFitWidth();
        this.renderController.updateRenderList();
    },

    setToFitHeight: function() {
        this.listView.setToFitHeight();
        this.renderController.updateRenderList();
    }
};
PDFListView.Logger = Logger;

return PDFListView;
});

