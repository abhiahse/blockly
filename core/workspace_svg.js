/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2014 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Object representing a workspace rendered as SVG.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.WorkspaceSvg');

// TODO(scr): Fix circular dependencies
// goog.require('Blockly.Block');
goog.require('Blockly.ScrollbarPair');
goog.require('Blockly.Trashcan');
goog.require('Blockly.Workspace');
goog.require('Blockly.Xml');

goog.require('goog.dom');
goog.require('goog.math.Coordinate');
goog.require('goog.userAgent');


/**
 * Class for a workspace.  This is an onscreen area with optional trashcan,
 * scrollbars, bubbles, and dragging.
 * @param {!Object} options Dictionary of options.
 * @extends {Blockly.Workspace}
 * @constructor
 */
Blockly.WorkspaceSvg = function(options) {
  Blockly.WorkspaceSvg.superClass_.constructor.call(this, options);
  this.getMetrics = options.getMetrics;
  this.setMetrics = options.setMetrics;

  Blockly.ConnectionDB.init(this);
  /**
   * Database of pre-loaded sounds.
   * @private
   * @const
   */
  this.SOUNDS_ = Object.create(null);
};
goog.inherits(Blockly.WorkspaceSvg, Blockly.Workspace);

/**
 * Svg workspaces are user-visible (as opposed to a headless workspace).
 * @type {boolean} True if visible.  False if headless.
 */
Blockly.WorkspaceSvg.prototype.rendered = true;

/**
 * Is this workspace the surface for a flyout?
 * @type {boolean}
 */
Blockly.WorkspaceSvg.prototype.isFlyout = false;

/**
 * Can this workspace be dragged around (true) or is it fixed (false)?
 * @type {boolean}
 */
Blockly.WorkspaceSvg.prototype.dragMode = false;

/**
 * Current horizontal scrolling offset.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.scrollX = 0;

/**
 * Current vertical scrolling offset.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.scrollY = 0;

/**
 * The workspace's trashcan (if any).
 * @type {Blockly.Trashcan}
 */
Blockly.WorkspaceSvg.prototype.trashcan = null;

/**
 * This workspace's scrollbars, if they exist.
 * @type {Blockly.ScrollbarPair}
 */
Blockly.WorkspaceSvg.prototype.scrollbar = null;

/**
 * Create the trash can elements.
 * @param {string=} opt_backgroundClass Either 'blocklyMainBackground' or
 *     'blocklyMutatorBackground'.
 * @return {!Element} The workspace's SVG group.
 */
Blockly.WorkspaceSvg.prototype.createDom = function(opt_backgroundClass) {
  /*
  <g>
    <rect class="blocklyMainBackground" height="100%" width="100%"></rect>
    [Trashcan and/or flyout may go here]
    <g></g>  // Block canvas
    <g></g>  // Bubble canvas
    [Scrollbars may go here]
  </g>
  */
  this.svgGroup_ = Blockly.createSvgElement('g', {}, null);
  if (opt_backgroundClass) {
    this.svgBackground_ = Blockly.createSvgElement('rect',
        {'height': '100%', 'width': '100%',
         'class': opt_backgroundClass}, this.svgGroup_);
  }
  this.svgBlockCanvas_ = Blockly.createSvgElement('g', {}, this.svgGroup_);
  this.svgBubbleCanvas_ = Blockly.createSvgElement('g', {}, this.svgGroup_);
  if (this.options.hasTrashcan) {
    this.addTrashcan_();
  }

  // Determine if there needs to be a category tree, or a simple list of
  // blocks.  This cannot be changed later, since the UI is very different.
  if (this.options.hasCategories) {
    this.toolbox_ = new Blockly.Toolbox(this);
  } else if (this.options.languageTree) {
    this.addFlyout_();
  }

  this.fireChangeEvent();
  return this.svgGroup_;
};

/**
 * Dispose of this workspace.
 * Unlink from all DOM elements to prevent memory leaks.
 */
Blockly.WorkspaceSvg.prototype.dispose = function() {
  // Stop rerendering.
  this.rendered = false;
  Blockly.WorkspaceSvg.superClass_.dispose.call(this);
  if (this.svgGroup_) {
    goog.dom.removeNode(this.svgGroup_);
    this.svgGroup_ = null;
  }
  this.svgBlockCanvas_ = null;
  this.svgBubbleCanvas_ = null;
  if (this.flyout_) {
    this.flyout_.dispose();
    this.flyout_ = null;
  }
  if (this.trashcan) {
    this.trashcan.dispose();
    this.trashcan = null;
  }
};

/**
 * Add a trashcan.
 * @private
 */
Blockly.WorkspaceSvg.prototype.addTrashcan_ = function() {
  this.trashcan = new Blockly.Trashcan(this);
  var svgTrashcan = this.trashcan.createDom();
  this.svgGroup_.insertBefore(svgTrashcan, this.svgBlockCanvas_);
  this.trashcan.init();
};

/**
 * Add a flyout.
 * @private
 */
Blockly.WorkspaceSvg.prototype.addFlyout_ = function() {
  var workspaceOptions = {
    parentWorkspace: this,
    RTL: this.RTL
  };
  this.flyout_ = new Blockly.Flyout(workspaceOptions);
  this.flyout_.autoClose = false;
  var svgFlyout = this.flyout_.createDom();
  this.svgGroup_.insertBefore(svgFlyout, this.svgBlockCanvas_);
};

/**
 * Get the SVG element that forms the drawing surface.
 * @return {!Element} SVG element.
 */
Blockly.WorkspaceSvg.prototype.getCanvas = function() {
  return this.svgBlockCanvas_;
};

/**
 * Get the SVG element that forms the bubble surface.
 * @return {!SVGGElement} SVG element.
 */
Blockly.WorkspaceSvg.prototype.getBubbleCanvas = function() {
  return this.svgBubbleCanvas_;
};

/**
 * Translate this workspace to new coordinates.
 * @param {number} x Horizontal translation.
 * @param {number} y Vertical translation.
 */
Blockly.WorkspaceSvg.prototype.translate = function(x, y) {
  var translation = 'translate(' + x + ',' + y + ')';
  this.svgBlockCanvas_.setAttribute('transform', translation);
  this.svgBubbleCanvas_.setAttribute('transform', translation);
};

/**
 * Add a block to the list of top blocks.
 * @param {!Blockly.Block} block Block to remove.
 */
Blockly.WorkspaceSvg.prototype.addTopBlock = function(block) {
  Blockly.WorkspaceSvg.superClass_.addTopBlock.call(this, block);
  if (Blockly.Realtime.isEnabled() && this == Blockly.mainWorkspace) {
    Blockly.Realtime.addTopBlock(block);
  }
};

/**
 * Remove a block from the list of top blocks.
 * @param {!Blockly.Block} block Block to remove.
 */
Blockly.WorkspaceSvg.prototype.removeTopBlock = function(block) {
  Blockly.WorkspaceSvg.superClass_.removeTopBlock.call(this, block);
  if (Blockly.Realtime.isEnabled() && this == Blockly.mainWorkspace) {
    Blockly.Realtime.removeTopBlock(block);
  }
};

/**
 * Dispose of all blocks in workspace.
 */
Blockly.WorkspaceSvg.prototype.clear = function() {
  Blockly.hideChaff();
  Blockly.WorkspaceSvg.superClass_.clear.call(this);
};

/**
 * Returns the horizontal offset of the workspace.
 * Intended for LTR/RTL compatibility in XML.
 * @return {number} Width.
 */
Blockly.WorkspaceSvg.prototype.getWidth = function() {
  return this.getMetrics().viewWidth;
};

/**
 * Render all blocks in workspace.
 */
Blockly.WorkspaceSvg.prototype.render = function() {
  var renderList = this.getAllBlocks();
  for (var x = 0, block; block = renderList[x]; x++) {
    if (!block.getChildren().length) {
      block.render();
    }
  }
};

/**
 * Turn the visual trace functionality on or off.
 * @param {boolean} armed True if the trace should be on.
 */
Blockly.WorkspaceSvg.prototype.traceOn = function(armed) {
  this.traceOn_ = armed;
  if (this.traceWrapper_) {
    Blockly.unbindEvent_(this.traceWrapper_);
    this.traceWrapper_ = null;
  }
  if (armed) {
    this.traceWrapper_ = Blockly.bindEvent_(this.svgBlockCanvas_,
        'blocklySelectChange', this, function() {this.traceOn_ = false});
  }
};

/**
 * Highlight a block in the workspace.
 * @param {?string} id ID of block to find.
 */
Blockly.WorkspaceSvg.prototype.highlightBlock = function(id) {
  if (this.traceOn_ && Blockly.dragMode_ != 0) {
    // The blocklySelectChange event normally prevents this, but sometimes
    // there is a race condition on fast-executing apps.
    this.traceOn(false);
  }
  if (!this.traceOn_) {
    return;
  }
  var block = null;
  if (id) {
    block = this.getBlockById(id);
    if (!block) {
      return;
    }
  }
  // Temporary turn off the listener for selection changes, so that we don't
  // trip the monitor for detecting user activity.
  this.traceOn(false);
  // Select the current block.
  if (block) {
    block.select();
  } else if (Blockly.selected) {
    Blockly.selected.unselect();
  }
  // Restore the monitor for user activity after the selection event has fired.
  var thisWorkspace = this;
  setTimeout(function() {thisWorkspace.traceOn(true);}, 1);
};

/**
 * Fire a change event for this workspace.  Changes include new block, dropdown
 * edits, mutations, connections, etc.  Groups of simultaneous changes (e.g.
 * a tree of blocks being deleted) are merged into one event.
 * Applications may hook workspace changes by listening for
 * 'blocklyWorkspaceChange' on Blockly.mainWorkspace.getCanvas().
 */
Blockly.WorkspaceSvg.prototype.fireChangeEvent = function() {
  if (this.rendered && this.svgBlockCanvas_) {
    Blockly.fireUiEvent(this.svgBlockCanvas_, 'blocklyWorkspaceChange');
  }
};

/**
 * Paste the provided block onto the workspace.
 * @param {!Element} xmlBlock XML block element.
 */
Blockly.WorkspaceSvg.prototype.paste = function(xmlBlock) {
  if (xmlBlock.getElementsByTagName('block').length >=
      this.remainingCapacity()) {
    return;
  }
  var block = Blockly.Xml.domToBlock(this, xmlBlock);
  // Move the duplicate to original position.
  var blockX = parseInt(xmlBlock.getAttribute('x'), 10);
  var blockY = parseInt(xmlBlock.getAttribute('y'), 10);
  if (!isNaN(blockX) && !isNaN(blockY)) {
    if (this.RTL) {
      blockX = -blockX;
    }
    // Offset block until not clobbering another block.
    do {
      var collide = false;
      var allBlocks = this.getAllBlocks();
      for (var x = 0, otherBlock; otherBlock = allBlocks[x]; x++) {
        var otherXY = otherBlock.getRelativeToSurfaceXY();
        if (Math.abs(blockX - otherXY.x) <= 1 &&
            Math.abs(blockY - otherXY.y) <= 1) {
          if (this.RTL) {
            blockX -= Blockly.SNAP_RADIUS;
          } else {
            blockX += Blockly.SNAP_RADIUS;
          }
          blockY += Blockly.SNAP_RADIUS * 2;
          collide = true;
        }
      }
    } while (collide);
    block.moveBy(blockX, blockY);
  }
  block.select();
};

/**
 * Make a list of all the delete areas for this workspace.
 */
Blockly.WorkspaceSvg.prototype.recordDeleteAreas = function() {
  if (this.trashcan) {
    this.deleteAreaTrash_ = this.trashcan.getRect();
  } else {
    this.deleteAreaTrash_ = null;
  }
  if (this.flyout_) {
    this.deleteAreaToolbox_ = this.flyout_.getRect();
  } else if (this.toolbox_) {
    this.deleteAreaToolbox_ = this.toolbox_.getRect();
  } else {
    this.deleteAreaToolbox_ = null;
  }
};

/**
 * Is the mouse event over a delete area (toolbar or non-closing flyout)?
 * Opens or closes the trashcan and sets the cursor as a side effect.
 * @param {!Event} e Mouse move event.
 * @return {boolean} True if event is in a delete area.
 */
Blockly.WorkspaceSvg.prototype.isDeleteArea = function(e) {
  var isDelete = false;
  var mouseXY = Blockly.mouseToSvg(e);
  var xy = new goog.math.Coordinate(mouseXY.x, mouseXY.y);
  if (this.deleteAreaTrash_) {
    if (this.deleteAreaTrash_.contains(xy)) {
      this.trashcan.setOpen_(true);
      Blockly.Css.setCursor(Blockly.Css.Cursor.DELETE);
      return true;
    }
    this.trashcan.setOpen_(false);
  }
  if (this.deleteAreaToolbox_) {
    if (this.deleteAreaToolbox_.contains(xy)) {
      Blockly.Css.setCursor(Blockly.Css.Cursor.DELETE);
      return true;
    }
  }
  Blockly.Css.setCursor(Blockly.Css.Cursor.CLOSED);
  return false;
};

/**
 * Load an audio file.  Cache it, ready for instantaneous playing.
 * @param {!Array.<string>} filenames List of file types in decreasing order of
 *   preference (i.e. increasing size).  E.g. ['media/go.mp3', 'media/go.wav']
 *   Filenames include path from Blockly's root.  File extensions matter.
 * @param {string} name Name of sound.
 * @private
 */
Blockly.WorkspaceSvg.prototype.loadAudio_ = function(filenames, name) {
  if (!window['Audio'] || !filenames.length) {
    // No browser support for Audio.
    return;
  }
  var sound;
  var audioTest = new window['Audio']();
  for (var i = 0; i < filenames.length; i++) {
    var filename = filenames[i];
    var ext = filename.match(/\.(\w+)$/);
    if (ext && audioTest.canPlayType('audio/' + ext[1])) {
      // Found an audio format we can play.
      sound = new window['Audio'](filename);
      break;
    }
  }
  if (sound && sound.play) {
    this.SOUNDS_[name] = sound;
  }
};

/**
 * Preload all the audio files so that they play quickly when asked for.
 * @private
 */
Blockly.WorkspaceSvg.prototype.preloadAudio_ = function() {
  for (var name in this.SOUNDS_) {
    var sound = this.SOUNDS_[name];
    sound.volume = .01;
    sound.play();
    sound.pause();
    // iOS can only process one sound at a time.  Trying to load more than one
    // corrupts the earlier ones.  Just load one and leave the others uncached.
    if (goog.userAgent.IPAD || goog.userAgent.IPHONE) {
      break;
    }
  }
};

/**
 * Play an audio file at specified value.  If volume is not specified,
 * use full volume (1).
 * @param {string} name Name of sound.
 * @param {?number} opt_volume Volume of sound (0-1).
 */
Blockly.WorkspaceSvg.prototype.playAudio = function(name, opt_volume) {
  var sound = this.SOUNDS_[name];
  if (sound) {
    var mySound;
    var ie9 = goog.userAgent.DOCUMENT_MODE &&
              goog.userAgent.DOCUMENT_MODE === 9;
    if (ie9 || goog.userAgent.IPAD || goog.userAgent.ANDROID) {
      // Creating a new audio node causes lag in IE9, Android and iPad. Android
      // and IE9 refetch the file from the server, iPad uses a singleton audio
      // node which must be deleted and recreated for each new audio tag.
      mySound = sound;
    } else {
      mySound = sound.cloneNode();
    }
    mySound.volume = (opt_volume === undefined ? 1 : opt_volume);
    mySound.play();
  } else if (this.options.parentWorkspace) {
    // Maybe a workspace on a lower level knows about this sound.
    this.options.parentWorkspace.playAudio(name, opt_volume);
  }
};

// Export symbols that would otherwise be renamed by Closure compiler.
Blockly.WorkspaceSvg.prototype['clear'] = Blockly.WorkspaceSvg.prototype.clear;
