function _flat(arr) {
    var res = arr.reduce(function(a, b) {
        return a.concat(b);
    });
    return res;
}

function failDumper(err) {
    alert('fail' + err);
    console.error(err);
}

PDFJS.Promise.prototype.thenThis = function(scope, callback, errback, progressback) {
    return this.then(
        callback ? callback.bind(scope) : undefined,
        errback ? errback.bind(scope) : undefined,
        progressback ? progressback.bind(scope) : undefined
    );
};

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
    PDFJS.getDocument(parameters).thenThis(this, this.loadPages, failDumper);
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
            return new PDFPage(pdfPage);
        });

        this.initialized.resolve();
    }, failDumper);
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
var SCALE_MODE_VALUE = 'scale_mode_value';

/**
 * Main view that holds the single pageContainer/pageViews of the pdfDoc.
 */
function ListView(pdfDoc, dom) {
    this.onScroll = this.onScroll.bind(this);

    this.pdf = pdfDoc;
    this.dom = dom;

    this.pageLayout = LAYOUT_SINGLE;
    this.scaleMode = SCALE_MODE_VALUE;
    this.scale = 1.0;

    this.pageViews = [];
    this.containerViews = [];

    // TODO: Handle multiple layout types here. For now, assume to have one page
    // per pageContainer.
    pdfDoc.pages.map(function(page) {
        var pageView = new PageView(page, this);
        this.pageViews.push(pageView);

        var container = new PageContainerView(pageView);
        container.setPageView(pageView, 0);
        this.containerViews.push(container);

        dom.appendChild(container.dom);
    }, this);


    this.onScroll();
    this.dom.addEventListener('scroll', this.onScroll);
}

ListView.prototype = {
    onScroll: function() {
        // Cache these resutls to avoid dom access.
        this.scrollTop = this.dom.scrollTop;
        this.scrollBottom = this.scrollTop + this.dom.clientHeight;
    },

    layout: function() {
        this.containerViews.forEach(function(containerView) {
            containerView.layout();
        });
    },

    getPagesToRender: function() {
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
function PageContainerView(pageCount) {
    var dom = this.dom = document.createElement('div');
    dom.className = 'pageContainer';
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
        var width = 0;
        this.pages.forEach(function(pageView) {
            pageView.layout();
            width += pageView.width;
        });
        this.dom.style.width = width + 'px';
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

    this.isRendered = false;
    this.renderState = RenderingStates.INITIAL;

    var dom = this.dom = document.createElement('div');
    var canvas = this.canvas = document.createElement('canvas');

    dom.appendChild(canvas);
}

PageView.prototype = {
    layout: function() {
        var scale = this.listView.scale;
        var totalRotation = 0;

        // TODO: Rotation
        var viewport = this.viewport =
            this.page.pdfPage.getViewport(scale, totalRotation);

        this.width = viewport.width;
        this.height = viewport.height;
        this.canvas.width = Math.floor(this.width);
        this.canvas.height = Math.floor(this.height);
    },

    isVisible: function() {
        var listView = this.listView;
        var dom = this.dom;
        var offsetTop = dom.offsetTop;
        var offsetBottom = offsetTop + this.height;

        return offsetBottom >= listView.scrollTop &&
                offsetTop <= listView.scrollBottom;
    },

    render: function(renderController) {
        return this.page.render(this, renderController);
    },

    get number() {
        return this.page.number;
    },

    getCanvasContext: function() {
        return this.canvas.getContext('2d');
    }
};

/**
 * An abstraction around the raw page object of PDF.JS, that also handles the
 * rendering logic of (maybe multiple) pageView(s) that are based on this page.
 */
function PDFPage(pdfPage, number) {
    this.number = number;
    this.pdfPage = pdfPage;

    this.renderContextList = {};
}

PDFPage.prototype = {
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

        if (renderContext = this.renderContextList[pageView.id]) {
            var viewport = renderContext.viewport;

            // TODO: handle rotation
            if (viewport.height !== pageView.viewport.height ||
                viewport.height !== pageView.viewport.height)
            {
                // The viewport changed -> need to rerender.
                renderContext = null;
            } else if (renderContext.state === RenderingStates.PAUSED) {
                // There is already a not finished renderState ->
                console.log('RESUME', pageView.id);
                renderContext.resume();
            }
        }

        if (!renderContext) {
            // No rendering data yet -> create a new renderContext and start
            // the rendering process.
            renderContext = {
              canvasContext: pageView.getCanvasContext(),
              viewport: pageView.viewport,
              // textLayer: textLayer,
              continueCallback: function pdfViewContinueCallback(cont) {
                if (renderController.pageToRender() !== pageView) {
                  console.log('PAUSE', pageView.id);
                  renderContext.state = RenderingStates.PAUSED;
                  renderContext.resume = function resumeCallback() {
                    renderContext.state = RenderingStates.RUNNING;
                    cont();
                  };
                  return;
                }
                console.log('CONT', pageView.id);
                cont();
              }
            };
            this.renderContextList[pageView.id] = renderContext;

            renderContext.renderPromise = this.pdfPage.render(renderContext);
            renderContext.renderPromise.then(
              function pdfPageRenderCallback() {
                console.log('DONE', pageView.id);
                pageView.isRendered = true;
                renderController.finishedRendering(pageView);
              },
              failDumper
            );
        }

        return renderContext.renderPromise;
    }
};

function boot() {
    var pdf = new Document('external/tracemonkey.pdf');
    pdf.initialized.then(function() {
        console.log('loaded');

        var mainDiv = document.body.querySelector('#main');
        var listView = new ListView(pdf, mainDiv);
        listView.layout();

        var renderController = new RenderController();
        renderController.addListView(listView);
        renderController.updateRenderList();

        mainDiv.addEventListener('scroll', function() {
            // This will update the list AND start rendering if needed.
            renderController.updateRenderList();
        });

        window.listView = listView;
        window.renderController = renderController;
    }, failDumper);
}

boot();