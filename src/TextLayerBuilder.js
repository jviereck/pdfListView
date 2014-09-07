(function (name, context, definition) {
  if (typeof module != 'undefined' && module.exports) module.exports = definition()
  else if (typeof define == 'function' && define.amd) define(definition)
  else context[name] = definition()
})('TextLayerBuilder', this, function (name, context) {

var MAX_TEXT_DIVS_TO_RENDER = 100000;

// optimised CSS custom property getter/setter
var CustomStyle = (function CustomStyleClosure() {

  // As noted on: http://www.zachstronaut.com/posts/2009/02/17/
  //              animate-css-transforms-firefox-webkit.html
  // in some versions of IE9 it is critical that ms appear in this list
  // before Moz
  var prefixes = ['ms', 'Moz', 'Webkit', 'O'];
  var _cache = { };

  function CustomStyle() {
  }

  CustomStyle.getProp = function get(propName, element) {
    // check cache only when no element is given
    if (arguments.length == 1 && typeof _cache[propName] == 'string') {
      return _cache[propName];
    }

    element = element || document.documentElement;
    var style = element.style, prefixed, uPropName;

    // test standard property first
    if (typeof style[propName] == 'string') {
      return (_cache[propName] = propName);
    }

    // capitalize
    uPropName = propName.charAt(0).toUpperCase() + propName.slice(1);

    // test vendor specific properties
    for (var i = 0, l = prefixes.length; i < l; i++) {
      prefixed = prefixes[i] + uPropName;
      if (typeof style[prefixed] == 'string') {
        return (_cache[propName] = prefixed);
      }
    }

    //if all fails then set to undefined
    return (_cache[propName] = 'undefined');
  };

  CustomStyle.setProp = function set(propName, element, str) {
    var prop = this.getProp(propName);
    if (prop != 'undefined')
      element.style[prop] = str;
  };

  return CustomStyle;
})();

function TextLayerBuilder(textLayerDiv, viewport) {
    this.textDivs = [];
    this.textLayerDiv = textLayerDiv;
    this.viewport = viewport;
};

TextLayerBuilder.prototype = {
    appendText: function TextLayerBuilder_appendText(geom, styles) {
        var style = styles[geom.fontName];
        var textDiv = document.createElement('div');
        this.textDivs.push(textDiv);
        if (!/\S/.test(geom.str)) {
          textDiv.dataset.isWhitespace = true;
          return;
        }
        var tx = PDFJS.Util.transform(this.viewport.transform, geom.transform);
        var angle = Math.atan2(tx[1], tx[0]);
        if (style.vertical) {
          angle += Math.PI / 2;
        }
        var fontHeight = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
        var fontAscent = (style.ascent ? style.ascent * fontHeight :
          (style.descent ? (1 + style.descent) * fontHeight : fontHeight));

        textDiv.style.position = 'absolute';
        textDiv.style.left = (tx[4] + (fontAscent * Math.sin(angle))) + 'px';
        textDiv.style.top = (tx[5] - (fontAscent * Math.cos(angle))) + 'px';
        textDiv.style.fontSize = fontHeight + 'px';
        textDiv.style.fontFamily = style.fontFamily;

        textDiv.textContent = geom.str;
        textDiv.dataset.fontName = geom.fontName;
        textDiv.dataset.angle = angle * (180 / Math.PI);
        if (style.vertical) {
          textDiv.dataset.canvasWidth = geom.height * this.viewport.scale;
        } else {
          textDiv.dataset.canvasWidth = geom.width * this.viewport.scale;
        }
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      this.textContent = textContent;

      var textItems = textContent.items;
      for (var i = 0, len = textItems.length; i < len; i++) {
        this.appendText(textItems[i], textContent.styles);
      }
      this.renderLayer();
    },

    renderLayer: function TextLayerBuilder_renderLayer() {
        var textLayerFrag = document.createDocumentFragment();
        var textDivs = this.textDivs;
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');

        // No point in rendering so many divs as it'd make the browser unusable
        // even after the divs are rendered
        var MAX_TEXT_DIVS_TO_RENDER = 100000;
        if (textDivs.length > MAX_TEXT_DIVS_TO_RENDER) {
          return;
        }

        for (var i = 0, ii = textDivs.length; i < ii; i++) {
          var textDiv = textDivs[i];
          if ('isWhitespace' in textDiv.dataset) {
            continue;
          }

          ctx.font = textDiv.style.fontSize + ' ' + textDiv.style.fontFamily;
          var width = ctx.measureText(textDiv.textContent).width;

          if (width > 0) {
            textLayerFrag.appendChild(textDiv);
            var textScale = textDiv.dataset.canvasWidth / width;
            var rotation = textDiv.dataset.angle;
            var transform = 'scale(' + textScale + ', 1)';
            transform = 'rotate(' + rotation + 'deg) ' + transform;
            CustomStyle.setProp('transform' , textDiv, transform);
            CustomStyle.setProp('transformOrigin' , textDiv, '0% 0%');
          }
        }

        this.textLayerDiv.appendChild(textLayerFrag);
    },
};

return TextLayerBuilder;

});
