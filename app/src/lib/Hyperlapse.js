/**
 * @overview Hyperapse.js - JavaScript hyper-lapse utility for Google Street View.
 * @author Peter Nitsch
 * @copyright Teehan+Lax 2013
 */

Number.prototype.toRad = function () {
  return this * Math.PI / 180;
};

Number.prototype.toDeg = function () {
  return this * 180 / Math.PI;
};

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function (from, to) {
  let rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

let pointOnLine = function (t, a, b) {
  let lat1 = a.lat().toRad(), lon1 = a.lng().toRad();
  let lat2 = b.lat().toRad(), lon2 = b.lng().toRad();

  x = lat1 + t * (lat2 - lat1);
  y = lon1 + t * (lon2 - lon1);

  return new google.maps.LatLng(x.toDeg(), y.toDeg());
};

/**
 * @class
 * @classdesc Value object for a single point in a Hyperlapse sequence.
 * @constructor
 * @param {google.maps.LatLng} location
 * @param {String} pano_id
 * @param {Object} params
 * @param {Number} [params.heading=0]
 * @param {Number} [params.pitch=0]
 * @param {Number} [params.elevation=0]
 * @param {Image} [params.image=null]
 * @param {String} [params.copyright="© 2013 Google"]
 * @param {String} [params.image_date=""]
 */
let HyperlapsePoint = function (location, pano_id, params) {

  let self = this;
  params = params || {};

  /**
   * @type {google.maps.LatLng}
   */
  this.location = location;

  /**
   * @type {Number}
   */
  this.pano_id = pano_id;

  /**
   * @default 0
   * @type {Number}
   */
  this.heading = params.heading || 0;

  /**
   * @default 0
   * @type {Number}
   */
  this.pitch = params.pitch || 0;

  /**
   * @default 0
   * @type {Number}
   */
  this.elevation = params.elevation || 0;

  /**
   * @type {Image}
   */
  this.image = params.image || null;

  /**
   * @default "© 2013 Google"
   * @type {String}
   */
  this.copyright = params.copyright || '© 2013 Google';

  /**
   * @type {String}
   */
  this.image_date = params.image_date || '';

};

/**
 * @class
 * @constructor
 * @param {Node} container - HTML element
 * @param {Object} params
 * @param {Number} [params.width=800]
 * @param {Number} [params.height=400]
 * @param {boolean} [params.use_elevation=false]
 * @param {Number} [params.distance_between_points=5]
 * @param {Number} [params.max_points=100]
 * @param {Number} [params.fov=70]
 * @param {Number} [params.zoom=1]
 * @param {google.maps.LatLng} [params.lookat=null]
 * @param {Number} [params.millis=50]
 * @param {Number} [params.elevation=0]
 * @param {Number} [params.tilt=0]
 */
let Hyperlapse = function (container, params) {

  'use strict';

  var self = this,
    _listeners = [],
    _container = container,
    _params = params || {},
    _w = _params.width || 800,
    _h = _params.height || 400,
    _d = 20,
    _use_elevation = _params.use_elevation || false,
    _distance_between_points = _params.distance_between_points || 5,
    _max_points = _params.max_points || 100,
    _fov = _params.fov || 70,
    _zoom = _params.zoom || 1,
    _lat = 0, _lon = 0,
    _position_x = 0, _position_y = 0,
    _is_playing = false, _is_loading = false,
    _point_index = 0,
    _currentLoadTime = '',
    _origin_heading = 0, _origin_pitch = 0,
    _forward = true,
    _lookat_heading = 0, _lookat_elevation = 0,
    _canvas, _context,
    _camera, _scene, _renderer, _mesh,
    _loader, _cancel_load = false,
    _ctime = Date.now(),
    _ptime = 0, _dtime = 0,
    _prev_pano_id = null,
    _raw_points = [], _h_points = [];

  /**
   * @event Hyperlapse#onError
   * @param {Object} e
   * @param {String} e.message
   */
  let handleError = function (e) {
    if (self.onError) self.onError(e);
  };

  /**
   * @event Hyperlapse#onFrame
   * @param {Object} e
   * @param {Number} e.position
   * @param {HyperlapsePoint} e.point
   */
  let handleFrame = function (e) {
    if (self.onFrame) self.onFrame(e);
  };

  /**
   * @event Hyperlapse#onPlay
   */
  let handlePlay = function (e) {
    if (self.onPlay) self.onPlay(e);
  };

  /**
   * @event Hyperlapse#onPause
   */
  let handlePause = function (e) {
    if (self.onPause) self.onPause(e);
  };

  let _elevator = new google.maps.ElevationService();
  let _streetview_service = new google.maps.StreetViewService();

  _canvas = document.createElement('canvas');
  _context = _canvas.getContext('2d');

  _camera = new THREE.PerspectiveCamera(_fov, _w / _h, 1, 1100);
  _camera.target = new THREE.Vector3(0, 0, 0);

  _scene = new THREE.Scene();
  _scene.add(_camera);

  // Check if we can use webGL
  let isWebGL = function () {
    try {
      return !!window.WebGLRenderingContext && !!document.createElement('canvas').getContext('experimental-webgl');
    } catch (e) {
      console.log('WebGL not available starting with CanvasRenderer');
      return false;
    }
  };

  _renderer = isWebGL() ? new THREE.WebGLRenderer() : new THREE.CanvasRenderer();
  _renderer.autoClearColor = false;
  _renderer.setSize(_w, _h);

  _mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 60, 40), new THREE.MeshBasicMaterial({
    map: new THREE.Texture(),
    side: THREE.DoubleSide,
    overdraw: true,
  }));
  _scene.add(_mesh);

  _container.appendChild(_renderer.domElement);

  _loader = new GSVPANO.PanoLoader({ zoom: _zoom });
  _loader.onError = function (message) {
    handleError({ message: message });
  };

  _loader.onPanoramaLoad = async function (x, y) {
    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    canvas.setAttribute('width', this.canvas.width);
    canvas.setAttribute('height', this.canvas.height);
    context.drawImage(this.canvas, 0, 0);

    _h_points[_point_index].image = canvas;

    const idx = _point_index;
    /** @type {Blob} */
    const blob = await new Promise((resolve) => canvas.toBlob(blob => resolve(blob), 'image/jpg', 0.8));
    const buffer = await blob.arrayBuffer();
    window.electronAPI.saveImage({
      buffer: buffer, time: _currentLoadTime, idx: idx, x: x, y: y,
    });

    if (++_point_index !== _h_points.length) {
      handleLoadProgress({ position: _point_index });

      if (!_cancel_load) {
        _loader.composePanorama(_h_points[_point_index].pano_id);
      } else {
        handleLoadCanceled({});
      }
    } else {
      handleLoadComplete({});
    }
  };

  _loader.onPanoramaData = (data) => {
    // console.log(data);
  };

  /**
   * @event Hyperlapse#onLoadCanceled
   */
  let handleLoadCanceled = function (e) {
    _cancel_load = false;
    _is_loading = false;

    if (self.onLoadCanceled) self.onLoadCanceled(e);
  };

  /**
   * @event Hyperlapse#onLoadProgress
   * @param {Object} e
   * @param {Number} e.position
   */
  let handleLoadProgress = function (e) {
    if (self.onLoadProgress) self.onLoadProgress(e);
  };

  /**
   * @event Hyperlapse#onLoadComplete
   */
  let handleLoadComplete = function (e) {
    _is_loading = false;
    _point_index = 0;

    animate();

    if (self.onLoadComplete) self.onLoadComplete(e);
  };

  /**
   * @event Hyperlapse#onRouteProgress
   * @param {Object} e
   * @param {HyperlapsePoint} e.point
   */
  let handleRouteProgress = function (e) {
    if (self.onRouteProgress) self.onRouteProgress(e);
  };

  /**
   * @event Hyperlapse#onRouteComplete
   * @param {Object} e
   * @param {google.maps.DirectionsResult} e.response
   * @param {Array<HyperlapsePoint>} e.points
   */
  let handleRouteComplete = function (e) {
    let elevations = [];
    for (let i = 0; i < _h_points.length; i++) {
      elevations[i] = _h_points[i].location;
    }

    if (_use_elevation) {
      getElevation(elevations, function (results) {
        if (results) {
          for (let i = 0; i < _h_points.length; i++) {
            _h_points[i].elevation = results[i].elevation;
          }
        } else {
          for (let i = 0; i < _h_points.length; i++) {
            _h_points[i].elevation = -1;
          }
        }

        self.setLookat(self.lookat, true, function () {
          if (self.onRouteComplete) self.onRouteComplete(e);
        });
      });
    } else {
      for (let i = 0; i < _h_points.length; i++) {
        _h_points[i].elevation = -1;
      }

      self.setLookat(self.lookat, false, function () {
        if (self.onRouteComplete) self.onRouteComplete(e);
      });
    }

  };

  let parsePoints = function (response, targetDate) {
    _loader.load(_raw_points[_point_index], targetDate, function () {
      if (_loader.id !== _prev_pano_id) {
        _prev_pano_id = _loader.id;

        let hp = new HyperlapsePoint(_loader.location, _loader.id, {
          heading: _loader.rotation,
          pitch: _loader.pitch,
          elevation: _loader.elevation,
          copyright: _loader.copyright,
          image_date: _loader.image_date,
        });

        _h_points.push(hp);

        handleRouteProgress({ point: hp });

        if (_point_index === _raw_points.length - 1) {
          handleRouteComplete({ response: response, points: _h_points });
        } else {
          _point_index++;
          if (!_cancel_load) parsePoints(response); else handleLoadCanceled({});
        }
      } else {

        _raw_points.splice(_point_index, 1);

        if (_point_index === _raw_points.length) {
          handleRouteComplete({ response: response, points: _h_points }); // FIX
        } else {
          if (!_cancel_load) parsePoints(response); else handleLoadCanceled({});
        }

      }

    });
  };

  let getElevation = function (locations, callback) {
    let positionalRequest = { locations: locations };

    _elevator.getElevationForLocations(positionalRequest, function (results, status) {
      if (status == google.maps.ElevationStatus.OK) {
        callback(results);
      } else {
        if (status == google.maps.ElevationStatus.OVER_QUERY_LIMIT) {
          console.log('Over elevation query limit.');
        }
        _use_elevation = false;
        callback(null);
      }
    });
  };

  let handleDirectionsRoute = function (response, targetDate) {
    if (!_is_playing) {

      let route = response.routes[0];
      let path = route.overview_path;
      let legs = route.legs;

      let total_distance = 0;
      for (let i = 0; i < legs.length; ++i) {
        total_distance += legs[i].distance.value;
      }

      let segment_length = total_distance / _max_points;
      _d = (segment_length < _distance_between_points) ? _d = _distance_between_points : _d = segment_length;

      let d = 0;
      let r = 0;
      let a, b;

      for (let i = 0; i < path.length; i++) {
        if (i + 1 < path.length) {

          a = path[i];
          b = path[i + 1];
          d = google.maps.geometry.spherical.computeDistanceBetween(a, b);

          if (r > 0 && r < d) {
            a = pointOnLine(r / d, a, b);
            d = google.maps.geometry.spherical.computeDistanceBetween(a, b);
            _raw_points.push(a);

            r = 0;
          } else if (r > 0 && r > d) {
            r -= d;
          }

          if (r === 0) {
            let segs = Math.floor(d / _d);

            if (segs > 0) {
              for (let j = 0; j < segs; j++) {
                let t = j / segs;

                if (t > 0 || (t + i) === 0) { // not start point
                  let way = pointOnLine(t, a, b);
                  _raw_points.push(way);
                }
              }

              r = d - (_d * segs);
            } else {
              r = _d * (1 - (d / _d));
            }
          }

        } else {
          _raw_points.push(path[i]);
        }
      }

      parsePoints(response, targetDate);
    } else {
      self.pause();
      handleDirectionsRoute(response, targetDate);
    }
  };

  let drawMaterial = function () {
    _mesh.material.map.image = _h_points[_point_index].image;
    _mesh.material.map.needsUpdate = true;

    _origin_heading = _h_points[_point_index].heading;
    _origin_pitch = _h_points[_point_index].pitch;

    if (self.use_lookat) _lookat_heading = google.maps.geometry.spherical.computeHeading(_h_points[_point_index].location, self.lookat);

    if (_h_points[_point_index].elevation !== -1) {
      let e = _h_points[_point_index].elevation - self.elevation_offset;
      let d = google.maps.geometry.spherical.computeDistanceBetween(_h_points[_point_index].location, self.lookat);
      let dif = _lookat_elevation - e;
      let angle = Math.atan(Math.abs(dif) / d).toDeg();
      _position_y = (dif < 0) ? -angle : angle;
    }

    handleFrame({
      position: _point_index, point: _h_points[_point_index],
    });
  };

  let render = function () {
    if (!_is_loading && self.length() > 0) {
      let t = _point_index / (self.length());

      let o_x = self.position.x + (self.offset.x * t);
      let o_y = self.position.y + (self.offset.y * t);
      let o_z = self.tilt + (self.offset.z.toRad() * t);

      let o_heading = (self.use_lookat) ? _lookat_heading - _origin_heading.toDeg() + o_x : o_x;
      let o_pitch = _position_y + o_y;

      let olon = _lon, olat = _lat;
      _lon = _lon + (o_heading - olon);
      _lat = _lat + (o_pitch - olat);

      _lat = Math.max(-85, Math.min(85, _lat));
      let phi = (90 - _lat).toRad();
      let theta = _lon.toRad();

      _camera.target.x = 500 * Math.sin(phi) * Math.cos(theta);
      _camera.target.y = 500 * Math.cos(phi);
      _camera.target.z = 500 * Math.sin(phi) * Math.sin(theta);
      _camera.lookAt(_camera.target);
      _camera.rotation.z -= o_z;

      if (self.use_rotation_comp) {
        _camera.rotation.z -= self.rotation_comp.toRad();
      }
      _mesh.rotation.z = _origin_pitch.toRad();
      _renderer.render(_scene, _camera);
    }
  };

  let animate = function () {
    let ptime = _ctime;
    _ctime = Date.now();
    _dtime += _ctime - ptime;
    if (_dtime >= self.millis) {
      if (_is_playing) loop();
      _dtime = 0;
    }

    requestAnimationFrame(animate);
    render();
  };

  // animates the playhead forward or backward depending on direction
  let loop = function () {
    drawMaterial();

    if (_forward) {
      if (++_point_index === _h_points.length) {
        _point_index = _h_points.length - 1;
        _forward = !_forward;
      }
    } else {
      if (--_point_index === -1) {
        _point_index = 0;
        _forward = !_forward;
      }
    }
  };

  /**
   * @type {google.maps.LatLng}
   */
  this.lookat = _params.lookat || null;

  /**
   * @default 50
   * @type {Number}
   */
  this.millis = _params.millis || 50;

  /**
   * @default 0
   * @type {Number}
   */
  this.elevation_offset = _params.elevation || 0;

  /**
   * @deprecated should use offset instead
   * @default 0
   * @type {Number}
   */
  this.tilt = _params.tilt || 0;

  /**
   * @default {x:0, y:0}
   * @type {Object}
   */
  this.position = { x: 0, y: 0 };

  /**
   * @default {x:0, y:0, z:0}
   * @type {Object}
   */
  this.offset = { x: 0, y: 0, z: 0 };

  /**
   * @default false
   * @type {boolean}
   */
  this.use_lookat = _params.use_lookat || false;

  /**
   * @default false
   * @type {boolean}
   */
  this.use_rotation_comp = false;

  /**
   * @default 0
   * @type {Number}
   */
  this.rotation_comp = 0;

  /**
   * @returns {boolean}
   */
  this.isPlaying = function () {
    return _is_playing;
  };

  /**
   * @returns {boolean}
   */
  this.isLoading = function () {
    return _is_loading;
  };

  /**
   * @returns {Number}
   */
  this.length = function () {
    return _h_points.length;
  };

  /**
   * @param {Number} v
   */
  this.setPitch = function (v) {
    _position_y = v;
  };

  /**
   * @param {Number} v
   */
  this.setDistanceBetweenPoint = function (v) {
    _distance_between_points = v;
  };

  /**
   * @param {Number} v
   */
  this.setMaxPoints = function (v) {
    _max_points = v;
  };

  /**
   * @returns {Number}
   */
  this.fov = function () {
    return _fov;
  };

  /**
   * @returns {THREE.WebGLRenderer}
   */
  this.webgl = function () {
    return _renderer;
  };

  /**
   * @returns {Image}
   */
  this.getCurrentImage = function () {
    return _h_points[_point_index].image;
  };

  /**
   * @returns {HyperlapsePoint}
   */
  this.getCurrentPoint = function () {
    return _h_points[_point_index];
  };

  /**
   * @param {google.maps.LatLng} point
   * @param {boolean} call_service
   * @param {function} callback
   */
  this.setLookat = function (point, call_service, callback) {
    self.lookat = point;

    if (_use_elevation && call_service) {
      getElevation([self.lookat], function (results) {
        if (results) {
          _lookat_elevation = results[0].elevation;
        }

        if (callback && callback.apply) {
          callback();
        }
      });
    } else {
      if (callback && callback.apply) callback();
    }
  };

  /**
   * @param {Number} v
   */
  this.setFOV = function (v) {
    _fov = Math.floor(v);
    _camera.projectionMatrix.makePerspective(_fov, _w / _h, 1, 1100);
  };

  /**
   * @param {Number} width
   * @param {Number} height
   */
  this.setSize = function (width, height) {
    _w = width;
    _h = height;
    _renderer.setSize(_w, _h);
    _camera.projectionMatrix.makePerspective(_fov, _w / _h, 1, 1100);
  };

  /**
   * Resets all members to defaults
   */
  this.reset = function () {
    _raw_points.remove(0, -1);
    _h_points.remove(0, -1);

    self.tilt = 0;

    _lat = 0;
    _lon = 0;

    self.position.x = 0;
    self.offset.x = 0;
    self.offset.y = 0;
    self.offset.z = 0;
    _position_x = 0;
    _position_y = 0;

    _point_index = 0;
    _origin_heading = 0;
    _origin_pitch = 0;

    _forward = true;
  };

  /**
   * @param {Object} params
   * @param {google.maps.DirectionsResult} params.route
   * @param {Number} [params.distance_between_points]
   * @param {Number} [params.max_points]
   * @param {Date} [params.targetDate]
   */
  this.generate = function (params) {
    if (!_is_loading) {
      _is_loading = true;
      self.reset();

      let p = params || {};
      _distance_between_points = p.distance_between_points || _distance_between_points;
      _max_points = p.max_points || _max_points;

      if (p.route) {
        handleDirectionsRoute(p.route, p.targetDate);
      } else {
        console.log('No route provided.');
      }
    }
  };

  /**
   * @fires Hyperlapse#onLoadComplete
   */
  this.load = function () {
    _point_index = 0;
    _currentLoadTime = this.getCurrentTimeStr();
    _loader.composePanorama(_h_points[_point_index].pano_id);
  };

  this.getCurrentTimeStr = () => {
    let date_ob = new Date();
    // current date
    // adjust 0 before single digit date
    let date = ('0' + date_ob.getDate()).slice(-2);
    // current month
    let month = ('0' + (date_ob.getMonth() + 1)).slice(-2);
    // current year
    let year = date_ob.getFullYear();
    // current hours
    let hours = date_ob.getHours();
    // current minutes
    let minutes = date_ob.getMinutes();
    // current seconds
    let seconds = date_ob.getSeconds();

    return `${year}${month}${date}_${hours}${minutes}${seconds}`;
  };

  /**
   * @fires Hyperlapse#onLoadCanceled
   */
  this.cancel = function () {
    if (_is_loading) {
      _cancel_load = true;
    }
  };

  /**
   * @returns {google.maps.LatLng}
   */
  this.getCameraPosition = function () {
    return new google.maps.LatLng(_lat, _lon);
  };

  /**
   * Animate through all frames in sequence
   * @fires Hyperlapse#onPlay
   */
  this.play = function () {
    if (!_is_loading) {
      _is_playing = true;
      handlePlay({});
    }
  };

  /**
   * Pause animation
   * @fires Hyperlapse#onPause
   */
  this.pause = function () {
    _is_playing = false;
    handlePause({});
  };

  /**
   * Display next frame in sequence
   * @fires Hyperlapse#onFrame
   */
  this.next = function () {
    self.pause();

    if (_point_index + 1 != _h_points.length) {
      _point_index++;
      drawMaterial();
    }
  };

  /**
   * Display previous frame in sequence
   * @fires Hyperlapse#onFrame
   */
  this.prev = function () {
    self.pause();

    if (_point_index - 1 !== 0) {
      _point_index--;
      drawMaterial();
    }
  };
};
