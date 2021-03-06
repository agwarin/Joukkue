//  ╦  ┌─┐┬ ┬┌─┐┬─┐╔╦╗┌─┐┌┬┐┌─┐┬
//  ║  ├─┤└┬┘├┤ ├┬┘║║║│ │ ││├┤ │
//  ╩═╝┴ ┴ ┴ └─┘┴└─╩ ╩└─┘─┴┘└─┘┴─┘

var LayerModel = function() {
  this.layers = {};
  this.layersSorted = [];

  var _this = this;
  this.Layer = function(name, depth) {
    this.name = name;
    this.enabled = true;
    this.crashed = false;
    this.editors = {};
    this.vars = '';
    this.varsObj = {};
    this.draw = '';
    this.drawFunc = function() {};
    this.depth = depth;
  }
}
LayerModel.prototype.createLayer = function(name, depth) {
  var l = new this.Layer(name, depth);
  this.layers[name] = l;
  return l;
}
LayerModel.prototype.setVars = function(name, html, selection) {
  var obj, l = this.layers[name];

  if(selection) {
    try {
      eval('obj = {' + selection + '}');
      for(var i in obj) {
        l.varsObj[i] = obj[i];
      }
    } catch(e) {
      selection = false;
    }
  }

  if(!selection) {
    // we could try/catch, but at least it was eval'ed by sender
    eval('obj = ' + ($('<div>').html(html).text() || '{}'));
    l.varsObj = obj;
  }

  l.vars = html;
  l.crashed = false;
  this.layers[name] = l;
}
LayerModel.prototype.setDraw = function(name, html) {
  var f, l = this.layers[name];

  // we could try/catch, but at least it was eval'ed by sender
  eval('f = function(d) { ' + $('<div>').html(html).text() + ' }');
  l.drawFunc = f;

  l.draw = html;
  l.crashed = false;
  this.layers[name] = l;
  this.sortLayers();
}
LayerModel.prototype.setLayers = function(layers) {
  var f, obj;
  this.layers = layers;
  for(var i in layers) {
    var l = layers[i];

    // we could try/catch, but at least it was eval'ed by sender
    eval('f = function(d) { ' + $('<div>').html(l.draw).text() + ' }');
    l.drawFunc = f;

    // we could try/catch, but at least it was eval'ed by sender
    eval('obj = ' + ($('<div>').html(l.vars).text() || '{}'));
    l.varsObj = obj;

    l.enabled = l.enabled !== false;
  };

  this.sortLayers();
}
LayerModel.prototype.draw = function(err_cb) {
  var _this = this;
  this.layersSorted.forEach(function(name) {
    push();
    try {
      _this.layers[name].drawFunc(_this.layers[name].varsObj);
    } catch(err) {
      _this.setCrashed(name);
      err_cb(name, err);
    }
    pop();
  });
}
LayerModel.prototype.remove = function(name) {
  delete this.layers[name];
  this.sortLayers();
}
LayerModel.prototype.setDepth = function(name, dep) {
  this.layers[name].depth = dep;
  this.sortLayers();
  return this.layersSorted.indexOf(name);
}
LayerModel.prototype.setEnabled = function(name, enabled) {
  this.layers[name].enabled = enabled;
  this.sortLayers();
}
LayerModel.prototype.setCrashed = function(name) {
  this.layers[name].crashed = true;
  this.sortLayers();
}
LayerModel.prototype.sortLayers = function() {
  var layers = this.layers;
  var activeLayerNames = Object.keys(layers).filter(function(name) {
    return layers[name].enabled && !layers[name].crashed;
  });
  var sortedDepths = activeLayerNames.map(function(name) {
    return { name: name, depth: layers[name].depth }
  });
  sortedDepths.sort(function(a, b) { return a.depth - b.depth});
  this.layersSorted = sortedDepths.map(function(o) { return o.name; })
};

//   ╦┌─┐┬ ┬┬┌─┬┌─┬ ┬┌─┐
//   ║│ ││ │├┴┐├┴┐│ │├┤
//  ╚╝└─┘└─┘┴ ┴┴ ┴└─┘└─┘

var Joukkue = function() {
  this.socket = io();
  this.lastEdit = {};
  this.modifiedLocally = {};
  this.animPlaying = true;
  this.reservedVSpace = 0;
  this.layerModel = new LayerModel();

  var _this = this;

  // Listen to socket events

  this.socket.on('connect', function() {
    _this.socket.emit(constants.CMD_ADD_USER, string.genRandomName());
  });

  this.socket.on(constants.CMD_SAY, function(username, msg, self) {
    var style;
    if(self) {
      style = 'chatFromSelf';
    } else if(username == txt.serverName) {
      style = 'chatFromServer';
    } else {
      style = 'chatFromOther';
    }
    _this.addTextToChat(
      string.fmt('<span class="%s">%s: <b>%s</b></span>',
                 style, username, $('<div/>').text(msg).html()
                )
    );
  });

  this.socket.on(constants.CMD_ADD_LAYER, function(name, depth) {
    cc.addLayerToDOM(cc.layerModel.createLayer(name, depth));
  });

  this.socket.on(constants.CMD_SET_VARS, function(name, html, selection) {
    // Order important. First DOM.
    _this.updateLayerDOM(name, 'vars', html);
    _this.layerModel.setVars(name, html, selection);
  });

  this.socket.on(constants.CMD_SET_DRAW, function(name, html) {
    // Order important. First DOM.
    _this.updateLayerDOM(name, 'draw', html);
    _this.layerModel.setDraw(name, html);
  });

  this.socket.on(constants.CMD_REMOVE, function(name) {
    if(cc.lastEdit.layerName == name) {
      $('#row_chatBox').focus();
    }

    _this.layerModel.remove(name);
    $('#' + name + '_draw').unbind();
    $('#' + name + '_vars').unbind();
    $('#' + name + '_draw').parent().remove();
  });

  this.socket.on(constants.CMD_SET_DEPTH, function(name, dep) {
    dep = parseFloat(dep) || 500;
    var newPos = _this.layerModel.setDepth(name, dep);

    var tr = $('#' + name + '_draw').parent();
    tr.detach();
    if(newPos == 0) {
      $('#grid').append(tr);
    } else {
      tr.insertBefore($('#grid tr').eq(-newPos));
    }
  });

  this.socket.on(constants.CMD_SET_ENABLED, function(name, enabled) {
    _this.layerModel.setEnabled(name, enabled);
    var tr = $('#' + name + '_draw').parent();
    if(enabled) {
      tr.removeClass('disabled');
    } else {
      tr.addClass('disabled');
    }
  });

  this.socket.on(constants.CMD_SET_LAYERS, function(layers, modified) {
    $('#grid tr.editable').remove();
    for(var l in layers) {
      _this.addLayerToDOM(layers[l]);
    }
    _this.layerModel.setLayers(layers);
    _this.clearCanvas();

    for(var lid in modified) {
      var len = Object.keys(modified[lid]).length;
      $('#' + lid).css('border-width', len);
    }
  });

  this.socket.on(constants.CMD_SET_MODIFIED, function(id, len) {
    $('#' + id).css('border-width', len);
  });
};
// orange dashed = conflict (someone sent layer I edited) > .revert
// 1px yellow line = 1 other editing
// 2px yellow line = 2 other editing
// 2px yello dashed = 1 other, 1 me editing


//  ╔╦╗╔═╗╔╦╗   ┬┬ ┬┌─┐┌─┐┬  ┬┌┐┌┌─┐
//   ║║║ ║║║║   ││ ││ ┬│ ┬│  │││││ ┬
//  ═╩╝╚═╝╩ ╩  └┘└─┘└─┘└─┘┴─┘┴┘└┘└─┘

Joukkue.prototype.getSelection = function() {
  var sel = window.getSelection();
  if (sel.getRangeAt && sel.rangeCount) {
    return sel.getRangeAt(0);
  }
  return null;
}

Joukkue.prototype.restoreSelection = function(range) {
  if (range) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

Joukkue.prototype.addTextToChat = function(msg) {
  $('#row_chatView').append(msg + '<br/>');
  $('#row_chatView').scrollTop($('#row_chatView')[0].scrollHeight);
};

Joukkue.prototype.setCrashedInDOM = function(name, err, varType) {
  function setCrashed(obj) {
    obj.toggleClass('crashed', err !== false);
  }
  if(varType === undefined) {
    setCrashed($('#' + name + '_draw'));
    setCrashed($('#' + name + '_vars'));
  } else {
    setCrashed($('#' + name + '_' + varType));
  }

  if(err !== false) {
    cc.addTextToChat(string.fmt(txt.layerCrashed, name, err));
  }
};

Joukkue.prototype.addLayerToDOM = function(l) {
  // TODO: not just append, but use depth to decide where it goes
  // Update: layers are now sent sorted, so comment maybe no longer relevant
  $('#grid').append(
    string.fmt('<tr class="editable %s">', l.enabled === false ? 'disabled' : '')
    + string.fmt('<td id="%s_vars" contentEditable="true">%s</td>', l.name, l.vars || '')
    + string.fmt('<td id="%s_draw" contentEditable="true">%s</td>', l.name, l.draw || '')
    + '</tr>'
  );
  ['vars', 'draw'].map(function(n) {
    $('#' + l.name + '_' + n).focus(cc.onFocusEditable).blur(cc.onBlurEditable).mouseup(cc.onMouseUpEditable);
  });
  $('#' + l.name + '_draw').focus();
};

Joukkue.prototype.updateLayerDOM = function(name, varType, receivedHtml) {
  var view = $('#' + name + '_' + varType);
  // We compare three versions:
  // received html, view html and model html.

  // If local copy is clean
  if(view.html() == cc.layerModel.layers[name][varType]) {
    if(view.html() != receivedHtml) {
      view.html(receivedHtml);
    }
    view.addClass('flash');
    setTimeout(function() { view.removeClass('flash'); }, 100);
  } else if(view.html() != receivedHtml) {
    // If I'm not the author
    view.addClass('modifiedRemotely');
    this.addTextToChat(txt.layerModifiedRemotely);
  } else {
    view.removeClass('modifiedRemotely');
  }
}

Joukkue.prototype.onBlurEditable = function(e) {
  var t = $(e.currentTarget);
  var isGridElement = t.closest($('#grid')).length > 0;
  t.parent('tr').removeClass('editing');
  if(isGridElement) {
    cc.lastEdit.td.addClass('target');
  }
};

Joukkue.prototype.onFocusEditable = function(e) {
  var t = $(e.currentTarget);
  var isGridElement = t.closest($('#grid')).length > 0;
  t.parent('tr').addClass('editing');

  if(isGridElement) {
    var idParts = t.attr('id').split('_');
    cc.lastEdit = { td: t, layerName: idParts[0], varName: idParts[1], selection: undefined };
    $('#grid td.target').removeClass('target');

    // auto scroll up when clicking on last entry (if out of view)
    var offset = t.position().top + t.height() - $('#row_chatView').position().top + 12;
    if(offset > 0) {
      $('#row_grid').scrollTop(offset + $('#row_grid').scrollTop());
    }
  }
};

Joukkue.prototype.revert = function() {
  cc.lastEdit.td.html(
    cc.layerModel.layers[cc.lastEdit.layerName][cc.lastEdit.varName]
  );
  // hack. simulate key up.
  cc.onKeyup({ target: {
    id: cc.lastEdit.td.attr('id'),
    innerHTML: cc.lastEdit.td.html()
  }});
}

Joukkue.prototype.newLayer = function() {
  cc.socket.emit(constants.CMD_ADD_LAYER);
}

// A fix for the unexpected selection of text when
// click-on-last-cell auto scroll up
Joukkue.prototype.onMouseUpEditable = function() {
  var r = window.getSelection().getRangeAt(0);
  r.collapse();
}

Joukkue.prototype.onKeyup = function(e) {
  var id = e.target.id,
      idParts = id.split('_'),
      layer = cc.layerModel.layers[idParts[0]],
      modifiedLocally = e.target.innerHTML != layer[idParts[1]];

  $('#' + id).toggleClass('modifiedByMe', modifiedLocally);

  // emit only when modifiedLocally changes, not on each key press
  if(modifiedLocally != (cc.modifiedLocally[id] || false)) {
    cc.modifiedLocally[id] = modifiedLocally;
    cc.socket.emit(constants.CMD_SET_MODIFIED, id, modifiedLocally);
  }
}

Joukkue.prototype.onWindowResize = function() {
  $('#row_grid').height($(window).height() - this.reservedVSpace);
}

Joukkue.prototype.verifyAndSend = function(cell) {
  var idParts = cell.id.split('_'),
      layerName = idParts[0],
      varType = idParts[1],
      html = $(cell).html(),
      text = $(cell).text();

  try {
    if(varType == 'vars') {
      // sending empty is ok to replace old stuff
      eval('var tempVars = ' + (text || '{}'));
      var selection = window.getSelection().toString();
      cc.socket.emit(constants.CMD_SET_VARS, layerName, html, selection);
    } else {
      eval('var tempDraw = function(d) {' + text + '}');
      cc.socket.emit(constants.CMD_SET_DRAW, layerName, html);
    }
    cc.setCrashedInDOM(layerName, false, varType);
  } catch(e) {
    cc.setCrashedInDOM(layerName, e, varType);
  }
}

Joukkue.prototype.processChatMessage = function() {
  var cmd = $('#row_chatBox').text(),
      cmdArgs;
  if(cmd.charAt(0) == '.' && cmd.length > 1) {
    cmdArgs = cmd.substr(1).split(' ');
    switch(cmdArgs[0]) {

      case 'delete':
      case 'remove':
        this.socket.emit(constants.CMD_REMOVE, this.lastEdit.layerName);
        break;

      case 'help':
        this.addTextToChat(txt.help.replace(/_/g, '&nbsp;'));
        break;

      case 'name':
        if(cmdArgs[1].match(/\w+/)) {
          this.socket.emit(constants.CMD_SET_NEW_NAME, cmdArgs[1]);
        } else {
          this.addTextToChat(txt.nameHowto);
        }
        break;

      case 'new':
        this.socket.emit(constants.CMD_ADD_LAYER);
        break;

      case 'off':
        this.socket.emit(constants.CMD_SET_ENABLED, this.lastEdit.layerName, false);
        break;

      case 'on':
        this.socket.emit(constants.CMD_SET_ENABLED, this.lastEdit.layerName, true);
        break;

      case 'room':
        if(cmdArgs[1].match(/\w+/)) {
          this.socket.emit(constants.CMD_JOIN_ROOM, cmdArgs[1]);
        } else {
          this.addTextToChat(txt.roomHowto);
        }
        break;

      case 'rooms':
        this.socket.emit(constants.CMD_LIST_ROOMS);
        break;

      case 'top':
      case 'bottom':
      case 'up':
      case 'down':
        this.socket.emit(constants.CMD_SET_DEPTH, this.lastEdit.layerName, cmdArgs[0]);
        console.log(cmdArgs[0], this.lastEdit.layerName);
        break;

      case 'revert':
        cc.revert();
        break;

      case 'where':
      case 'who':
        this.socket.emit(constants.CMD_REQ_ROOM_INFO);
        break;

      default:
        this.addTextToChat(string.fmt(txt.unknownCmd, cmd));
    }
  } else {
    cc.socket.emit(constants.CMD_SAY, cmd);
  }
}

Joukkue.prototype.clearCanvas = function() {
  // p5
  background(0);
  loadImage("/joukkue.png", function(i) {
    image(i, width/2-i.width/2, height/2-i.height/2)
  });
}

//  ╔═╗╔═╕  ┬┌─┐
//  ╠═╝╚═╗  │└─┐
//  ╩  ╘═╝o└┘└─┘

function setup() {
  createCanvas(540, 540);
  cc.clearCanvas();
}

function draw() {
  cc.layerModel.draw(cc.setCrashedInDOM);
}


//  ╔╦╗╔═╗╔╦╗  ┌─┐┬  ┬┌─┐┌┐┌┬┐┌─┐   ┬   ┌┐ ┌─┐┌─┐┌┬┐
//   ║║║ ║║║║  ├┤ └┐┌┘├┤ ││││ └─┐  ┌┼─  ├┴┐│ ││ │ │
//  ═╩╝╚═╝╩ ╩  └─┘ └┘ └─┘┘└┘┴ └─┘  └┘   └─┘└─┘└─┘ ┴

$(function() {

  $('#but_help').val(txt.label_help);
  $('#but_help').click(function() {
    cc.addTextToChat(txt.help.replace(/_/g, '&nbsp;'));
  });

  $('#but_play_pause').val(txt.label_pause);
  $('#but_play_pause').click(function() {
    cc.animPlaying = !cc.animPlaying;
    if(cc.animPlaying) {
      loop();
      $('#but_play_pause').val(txt.label_pause);
    } else {
      noLoop();
      $('#but_play_pause').val(txt.label_play);
    }
  });

  $('#but_new_layer').val(txt.label_new_layer);
  $('#but_new_layer').click(function() {
    cc.newLayer();
  });

  $('#grid').keydown(function(e) {
    var layerName,
        k = e.keyCode || e.charCode;

    if(k == 27) {
      // ESC
      cc.lastEdit.selection = cc.getSelection();
      $('#row_chatBox').focus();
    } else if(e.altKey) {
      layerName = e.target.id.split('_')[0];

      if(k == 10 || k == 13) {
        // ALT + ENTER
        cc.verifyAndSend(e.target);
        e.preventDefault();

      } else if(k == 8 || k == 46 ) {
        // ALT + DEL
        cc.socket.emit(constants.CMD_REMOVE, layerName);
        e.preventDefault();

      } else if(k == 82) {
        // ALT + R
        cc.revert();
        e.preventDefault();
      } else if(k == 78) {
        // ALT + N
        // TODO: maybe this is wrong? 78 might be L key!
        // TODO: use keys JKLI = left down right up
        cc.newLayer();
        e.preventDefault();
      }
    } else if(k == 9) {
      // TAB
      document.execCommand('insertHTML', false, '&nbsp;&nbsp;');
      e.preventDefault();
    }
  });

  $('#grid').keyup($.debounce(500, true, cc.onKeyup));

  $('#row_chatBox').focus(cc.onFocusEditable).blur(cc.onBlurEditable);
  $('#row_chatBox').keydown(function(e) {
    var k = e.keyCode || e.charCode;

    if(k == 10 || k == 13) {
      // ENTER
      cc.processChatMessage();
      $('#row_chatBox').text('');
      e.preventDefault();

    } else if(k == 27) {
      // ESC
      cc.restoreSelection(cc.lastEdit.selection);
      cc.lastEdit.td.focus();
    }
  });

  // resize grid matching window size
  cc.reservedVSpace = $('#row_menu').outerHeight(true) +
    $('#row_chatView').outerHeight(true) +
    $('#row_chatBox').outerHeight(true) + 8;
  cc.onWindowResize();

  $(window).resize(function() {
    cc.onWindowResize();
  });

  // show welcome
  cc.addTextToChat(txt.welcome);
});


var cc = new Joukkue();
