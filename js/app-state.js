(function () {
  'use strict';

  var STATES = Object.freeze({
    IDLE: 'idle',
    CONVERTING: 'converting',
    SUCCESS: 'success',
    ERROR: 'error',
    UNAVAILABLE: 'unavailable',
    PRECRAWL: 'precrawl',
    RUNNING: 'running',
    PAUSED: 'paused',
    CRAWL_SUCCESS: 'crawl-success',
    CRAWL_PARTIAL: 'crawl-partial'
  });

  var TRANSITIONS = {};
  TRANSITIONS[STATES.IDLE] = [STATES.CONVERTING, STATES.PRECRAWL, STATES.UNAVAILABLE];
  TRANSITIONS[STATES.CONVERTING] = [STATES.SUCCESS, STATES.ERROR];
  TRANSITIONS[STATES.SUCCESS] = [STATES.IDLE, STATES.CONVERTING];
  TRANSITIONS[STATES.ERROR] = [STATES.IDLE, STATES.CONVERTING, STATES.PRECRAWL];
  TRANSITIONS[STATES.UNAVAILABLE] = [STATES.IDLE];
  TRANSITIONS[STATES.PRECRAWL] = [STATES.RUNNING, STATES.IDLE, STATES.ERROR];
  TRANSITIONS[STATES.RUNNING] = [STATES.PAUSED, STATES.CRAWL_SUCCESS, STATES.CRAWL_PARTIAL, STATES.ERROR];
  TRANSITIONS[STATES.PAUSED] = [STATES.RUNNING, STATES.CRAWL_SUCCESS, STATES.CRAWL_PARTIAL, STATES.ERROR];
  TRANSITIONS[STATES.CRAWL_SUCCESS] = [STATES.IDLE, STATES.PRECRAWL];
  TRANSITIONS[STATES.CRAWL_PARTIAL] = [STATES.IDLE, STATES.PRECRAWL, STATES.RUNNING];
  Object.freeze(TRANSITIONS);

  function AppState() {
    this.currentState = STATES.IDLE;
    this.data = {};
    this.listeners = [];
    this.viewFactories = {};
    this.container = null;
    this.currentViewInstance = null;
  }

  AppState.prototype.registerView = function (state, factory) {
    this.viewFactories[state] = factory;
  };

  AppState.prototype.setContainer = function (element) {
    this.container = element;
  };

  AppState.prototype.onStateChange = function (callback) {
    this.listeners.push(callback);
  };

  AppState.prototype.getState = function () {
    return this.currentState;
  };

  AppState.prototype.getData = function () {
    return Object.assign({}, this.data);
  };

  AppState.prototype.navigate = function (newState, data) {
    var allowed = TRANSITIONS[this.currentState];
    if (
      newState !== this.currentState &&
      allowed &&
      allowed.indexOf(newState) === -1
    ) {
      console.warn('[AppState] Invalid transition: ' + this.currentState + ' → ' + newState);
      return;  // Block the invalid transition
    }
    var prev = this.currentState;
    this.currentState = newState;
    this.data = Object.assign({}, data || {});

    if (this.currentViewInstance && typeof this.currentViewInstance.cleanup === 'function') {
      this.currentViewInstance.cleanup();
    }
    this._renderView();

    for (var i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](newState, prev, this.data); } catch (e) { console.error('[AppState]', e); }
    }
  };

  AppState.prototype.updateData = function (partial) {
    Object.assign(this.data, partial);
    if (this.currentViewInstance && typeof this.currentViewInstance.update === 'function') {
      this.currentViewInstance.update(this.data);
    }
  };

  AppState.prototype._renderView = function () {
    if (!this.container) return;
    var factory = this.viewFactories[this.currentState];
    if (!factory) { console.warn('[AppState] No view for: ' + this.currentState); return; }

    var self = this;
    this.container.classList.add('transitioning');
    requestAnimationFrame(function () {
      while (self.container.firstChild) self.container.removeChild(self.container.firstChild);
      self.currentViewInstance = factory(self.data);
      self.container.appendChild(self.currentViewInstance.render());
      requestAnimationFrame(function () { self.container.classList.remove('transitioning'); });
      if (typeof self.currentViewInstance.init === 'function') self.currentViewInstance.init();
    });
  };

  // Safe DOM builder
  function el(tag, attrs) {
    var element = document.createElement(tag);
    attrs = attrs || {};
    var children = Array.prototype.slice.call(arguments, 2);

    Object.keys(attrs).forEach(function (key) {
      var val = attrs[key];
      if (key === 'className') element.className = val;
      else if (key === 'textContent') element.textContent = val;
      else if (key.indexOf('on') === 0 && typeof val === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key === 'dataset') {
        Object.keys(val).forEach(function (dk) { element.dataset[dk] = val[dk]; });
      } else if (key === 'style' && typeof val === 'string') {
        element.style.cssText = val;
      } else {
        element.setAttribute(key, val);
      }
    });

    children.forEach(function (child) {
      if (typeof child === 'string') element.appendChild(document.createTextNode(child));
      else if (child instanceof Node) element.appendChild(child);
    });
    return element;
  }

  window.W2M = window.W2M || {};
  window.W2M.STATES = STATES;
  window.W2M.TRANSITIONS = TRANSITIONS;
  window.W2M.AppState = AppState;
  window.W2M.el = el;
})();
