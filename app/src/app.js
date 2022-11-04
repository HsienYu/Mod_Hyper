let start_point = new google.maps.LatLng(0, 0);
let end_point = new google.maps.LatLng(0, 0);
let map, directions_renderer, directions_service, streetview_service, geocoder;
let start_pin, end_pin, pivot_pin, camera_pin;
let _elevation = 0;
let _route_markers = [];

function show(msg) {
  document.getElementById('text').innerHTML = msg;
}

const registerPointInputEvent = (elementId, valueSetCallback) => {
  let pointInput = document.getElementById(elementId);
  if (!pointInput) {
    console.error(`Can not found ${elementId}`);
    return;
  }

  pointInput.addEventListener('change', (evt) => {
    let p = evt.currentTarget.value;
    let parts = p.split(',').map((v) => v.trim());
    if (valueSetCallback) {
      valueSetCallback(new google.maps.LatLng(parts[0], parts[1]));
    }
  });
};

function init() {
  // Add Point Input Event
  registerPointInputEvent('inputStartPoint', resultPoint => {
    console.log(`set start point ${resultPoint}`);

    map.setCenter(resultPoint);

    start_point = resultPoint;
    start_pin.setPosition(resultPoint);
    camera_pin.setPosition(resultPoint);
    changeHash();
  });

  registerPointInputEvent('inputEndPoint', resultPoint => {
    console.log(`set end point ${resultPoint}`);
    end_point = resultPoint;
    end_pin.setPosition(resultPoint);
    changeHash();
  });

  // if (window.location.hash) {
  //   parts = window.location.hash.substr(1).split(',');
  //   start_point = new google.maps.LatLng(parts[0], parts[1]);
  //   end_point = new google.maps.LatLng(parts[4], parts[5]);
  //   _elevation = parts[6] || 0;
  // }

  /* Map */

  function snapToRoad(point, callback) {
    let request = { origin: point, destination: point, travelMode: google.maps.TravelMode['DRIVING'] };
    directions_service.route(request, function (response, status) {
      if (status === 'OK') callback(response.routes[0].overview_path[0]); else callback(null);
    });
  }

  function changeHash() {
    window.location.hash = start_pin.getPosition().lat() + ',' + start_pin.getPosition().lng() + ',' + end_pin.getPosition().lat() + ',' + end_pin.getPosition().lng() + ',' + _elevation;
  }

  let mapOpt = {
    mapTypeId: google.maps.MapTypeId.ROADMAP, center: start_point, zoom: 15,
  };

  map = new google.maps.Map(document.getElementById('map'), mapOpt);
  geocoder = new google.maps.Geocoder();

  let overlay = new google.maps.StreetViewCoverageLayer();
  overlay.setMap(map);

  directions_service = new google.maps.DirectionsService();
  directions_renderer = new google.maps.DirectionsRenderer({ draggable: false, markerOptions: { visible: false } });
  directions_renderer.setMap(map);
  directions_renderer.setOptions({ preserveViewport: true });

  camera_pin = new google.maps.Marker({
    position: start_point, map: map,
  });

  start_pin = new google.maps.Marker({
    position: start_point, draggable: true, map: map,
  });

  google.maps.event.addListener(start_pin, 'dragend', function (event) {
    snapToRoad(start_pin.getPosition(), function (result) {
      start_pin.setPosition(result);
      start_point = result;
      changeHash();
    });
  });

  end_pin = new google.maps.Marker({
    position: end_point, draggable: true, map: map,
  });

  google.maps.event.addListener(end_pin, 'dragend', function (event) {
    snapToRoad(end_pin.getPosition(), function (result) {
      end_pin.setPosition(result);
      end_point = result;
      changeHash();
    });
  });

  function findAddress(address) {
    geocoder.geocode({ 'address': address }, function (results, status) {
      if (status === google.maps.GeocoderStatus.OK) {
        map.setCenter(results[0].geometry.location);
        theObj.drop_pins();
      } else {
        show('Geocode was not successful for the following reason: ' + status);
      }
    });
  }

  let search = document.getElementById('searchButton');
  search.addEventListener('click', function (event) {
    event.preventDefault();
    findAddress(document.getElementById('address').value);
  }, false);

  let targetDateInput = document.getElementById('targetDateInput');
  let getTargetDateFromInput = () => {
    if (!!targetDateInput.value) {
      return new Date(targetDateInput.value);
    }

    return new Date();
  };

  /* Hyperlapse */
  let pano = document.getElementById('pano');
  let is_moving = false;
  let px, py;
  let onPointerDownPointerX = 0, onPointerDownPointerY = 0;

  let hyperlapse = new Hyperlapse(pano, {
    fov: 80,
    millis: 50,
    width: window.innerWidth,
    height: window.innerHeight,
    zoom: 3,
    distance_between_points: 5,
    max_points: 100,
    elevation: _elevation,
  });

  hyperlapse.onError = function (e) {
    show('ERROR: ' + e.message);
  };

  hyperlapse.onRouteProgress = function (e) {
    _route_markers.push(new google.maps.Marker({
      position: e.point.location, draggable: false, icon: 'dot_marker.png', map: map,
    }));
  };

  hyperlapse.onRouteComplete = function (e) {
    directions_renderer.setDirections(e.response);
    show('Number of Points: ' + hyperlapse.length());
    hyperlapse.load();
  };

  hyperlapse.onLoadProgress = function (e) {
    show('Loading: ' + (e.position + 1) + ' of ' + hyperlapse.length());
  };

  hyperlapse.onLoadComplete = function (e) {
    show('' + 'Start: ' + start_pin.getPosition().toString() + '<br>End: ' + end_pin.getPosition().toString() + '<br>Ready.');
  };

  hyperlapse.onFrame = function (e) {
    show('' + 'Start: ' + start_pin.getPosition().toString() + '<br>End: ' + end_pin.getPosition().toString() + '<br>Position: ' + (e.position + 1) + ' of ' + hyperlapse.length());
    camera_pin.setPosition(e.point.location);
  };

  pano.addEventListener('mousedown', function (e) {
    e.preventDefault();

    is_moving = true;

    onPointerDownPointerX = e.clientX;
    onPointerDownPointerY = e.clientY;

    px = hyperlapse.position.x;
    py = hyperlapse.position.y;

  }, false);

  pano.addEventListener('mousemove', function (e) {
    e.preventDefault();
    let f = hyperlapse.fov() / 500;

    if (is_moving) {
      let dx = (onPointerDownPointerX - e.clientX) * f;
      let dy = (e.clientY - onPointerDownPointerY) * f;
      hyperlapse.position.x = px + dx; // reversed dragging direction (thanks @mrdoob!)
      hyperlapse.position.y = py + dy;

      theObj.position_x = hyperlapse.position.x;
      theObj.position_y = hyperlapse.position.y;
    }

  }, false);

  pano.addEventListener('mouseup', function () {
    is_moving = false;

    hyperlapse.position.x = px;
    //hyperlapse.position.y = py;
  }, false);

  /* Dat GUI */

  let gui = new dat.GUI();

  let theObj = {
    distance_between_points: 10,
    max_points: 100,
    fov: 80,
    elevation: Math.floor(_elevation),
    tilt: 0,
    millis: 50,
    offset_x: 0,
    offset_y: 0,
    offset_z: 0,
    position_x: 0,
    position_y: 0,
    use_lookat: false,
    screen_width: window.innerWidth,
    screen_height: window.innerHeight,
    generate: function () {

      show('Generating route...');

      directions_renderer.setDirections({ routes: [] });

      let marker;
      while (_route_markers.length > 0) {
        marker = _route_markers.pop();
        marker.setMap(null);
      }

      let request = {
        origin: start_point, destination: end_point, travelMode: google.maps.DirectionsTravelMode.DRIVING,
      };

      directions_service.route(request, function (response, status) {
        if (status === google.maps.DirectionsStatus.OK) {
          let inputDate = getTargetDateFromInput();
          console.log('Input date', inputDate.toJSON());
          hyperlapse.generate({ route: response, targetDate: inputDate });
        } else {
          console.error(status);
        }
      });
    },
    drop_pins: function () {
      let bounds = map.getBounds();
      let top_left = bounds.getNorthEast();
      let bot_right = bounds.getSouthWest();
      let hdif = Math.abs(top_left.lng() - bot_right.lng());
      let spacing = hdif / 4;

      let center = map.getCenter();
      let c1 = new google.maps.LatLng(center.lat(), center.lng() - spacing);
      let c3 = new google.maps.LatLng(center.lat(), center.lng() + spacing);

      snapToRoad(c1, function (result1) {
        start_pin.setPosition(result1);
        start_point = result1;

        snapToRoad(c3, function (result3) {
          end_pin.setPosition(result3);
          end_point = result3;
          changeHash();
        });
      });
    },
  };

  let scn = gui.addFolder('screen');
  scn.add(theObj, 'screen_width', window.innerHeight).listen();
  scn.add(theObj, 'screen_height', window.innerHeight).listen();

  let parameters = gui.addFolder('parameters');

  let distance_between_points_control = parameters.add(theObj, 'distance_between_points', 5, 100);
  distance_between_points_control.onChange(function (value) {
    hyperlapse.setDistanceBetweenPoint(value);
  });

  let max_points = parameters.add(theObj, 'max_points', 10, 300);
  max_points.onChange(function (value) {
    hyperlapse.setMaxPoints(value);
  });

  let fov_control = parameters.add(theObj, 'fov', 1, 180);
  fov_control.onChange(function (value) {
    hyperlapse.setFOV(value);
  });

  let pitch_control = parameters.add(theObj, 'elevation', -1000, 1000);
  pitch_control.onChange(function (value) {
    _elevation = value;
    hyperlapse.elevation_offset = value;
    changeHash();
  });

  let millis_control = parameters.add(theObj, 'millis', 10, 250);
  millis_control.onChange(function (value) {
    hyperlapse.millis = value;
  });

  let offset_x_control = parameters.add(theObj, 'offset_x', -360, 360);
  offset_x_control.onChange(function (value) {
    hyperlapse.offset.x = value;
  });

  let offset_y_control = parameters.add(theObj, 'offset_y', -180, 180);
  offset_y_control.onChange(function (value) {
    hyperlapse.offset.y = value;
  });

  let offset_z_control = parameters.add(theObj, 'offset_z', -360, 360);
  offset_z_control.onChange(function (value) {
    hyperlapse.offset.z = value;
  });

  let position_x_control = parameters.add(theObj, 'position_x', -360, 360).listen();
  position_x_control.onChange(function (value) {
    hyperlapse.position.x = value;
  });

  let position_y_control = parameters.add(theObj, 'position_y', -180, 180).listen();
  position_y_control.onChange(function (value) {
    hyperlapse.position.y = value;
  });

  let tilt_control = parameters.add(theObj, 'tilt', -Math.PI, Math.PI);
  tilt_control.onChange(function (value) {
    hyperlapse.tilt = value;
  });

  // parameters.open();

  let play_controls = gui.addFolder('play controls');
  play_controls.add(hyperlapse, 'play');
  play_controls.add(hyperlapse, 'pause');
  play_controls.add(hyperlapse, 'next');
  play_controls.add(hyperlapse, 'prev');
  play_controls.open();

  gui.add(theObj, 'drop_pins');
  gui.add(theObj, 'generate');
  // gui.add(hyperlapse, 'load');

  window.addEventListener('resize', function () {
    hyperlapse.setSize(window.innerWidth, window.innerHeight);
    theObj.screen_width = window.innerWidth;
    theObj.screen_height = window.innerHeight;
  }, false);

  document.addEventListener('keydown', onKeyDown, false);

  function onKeyDown(event) {
    let show_ui = true;

    switch (event.keyCode) {
      case 72: /* H */
        show_ui = !show_ui;
        document.getElementById('controls').style.opacity = show_ui ? '1' : '0';
        break;

      case 190: /* > */
        hyperlapse.next();
        break;

      case 188: /* < */
        hyperlapse.prev();
        break;
    }
  }

  // disable auto generate when start
  // theObj.generate();
}

window.onload = init;