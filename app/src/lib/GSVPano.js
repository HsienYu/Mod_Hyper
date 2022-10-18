var GSVPANO = GSVPANO || {};

/**
 *
 * @param {Date} target
 * @param {Array<{pano: string, Mo: Date}>} timePanos
 */
const getNearest = (target, timePanos) => {
  let ty = target.getFullYear();
  let tm = target.getMonth();
  let dates = timePanos.map(x => {
    return [x.Mo.getFullYear(), x.Mo.getMonth()];
  });
  let values = Array(dates.length);
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    values[i] = Math.abs((date[1] - tm) + ((date[0] - ty) * 12));
  }

  return values.indexOf(Math.min(...values));
};

GSVPANO.PanoLoader = function (parameters) {

  'use strict';

  var _parameters = parameters || {},
    _location,
    _zoom,
    _panoId,
    _panoClient = new google.maps.StreetViewService(),
    _count = 0,
    _total = 0,
    _canvas = document.createElement('canvas'),
    _ctx = _canvas.getContext('2d'),
    rotation = 0,
    pitch = 0,
    copyright = '',
    onSizeChange = null,
    onPanoramaLoad = null;

  this.setProgress = function (p) {

    if (this.onProgress) {
      this.onProgress(p);
    }

  };

  this.throwError = function (message) {
    if (this.onError) {
      this.onError(message);
    } else {
      console.error(message);
    }
  };

  this.adaptTextureToZoom = function () {

    var w = 416 * Math.pow(2, _zoom),
      h = (416 * Math.pow(2, _zoom - 1));
    _canvas.width = w;
    _canvas.height = h;
    _ctx.translate(_canvas.width, 0);
    _ctx.scale(-1, 1);
  };

  this.composeFromTile = async function (x, y, texture) {
    _ctx.drawImage(texture, x * 512, y * 512);
    _count++;

    let p = Math.round(_count * 100 / _total);
    this.setProgress(p);

    if (_count === _total) {
      this.canvas = _canvas;
      if (this.onPanoramaLoad) {
        await this.onPanoramaLoad();
      }
    }
  };

  this.composePanorama = function (panoId) {
    this.setProgress(0);
    console.log('Loading panorama for zoom ' + _zoom + '...');

    let w = (_zoom == 3) ? 7 : Math.pow(2, _zoom),
      h = Math.pow(2, _zoom - 1),
      self = this,
      url,
      x,
      y;

    _count = 0;
    _total = w * h;

    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        url = 'https://maps.google.com/cbk?output=tile&panoid=' + panoId + '&zoom=' + _zoom + '&x=' + x + '&y=' + y + '&' + Date.now();
        (function (x, y) {
          let img = new Image();
          img.addEventListener('load', async function () {
            await self.composeFromTile(x, y, this);
          });
          img.addEventListener('error', async function () {
            await self.composeFromTile(x, y, new Image());
          });
          img.crossOrigin = 'anonymous';
          img.src = url;
        })(x, y);
      }
    }
  };

  /**
   * @param {Object} responseData
   * @param {Date?} targetDate
   * @return {{panoId: *, imageDate, time: Array<{pano: string, Mo: Date}>, centerHeading, originPitch}}
   */
  this.fetchPanoramaInfo = (responseData, targetDate) => {
    let self = this;

    let result = {
      centerHeading: responseData.tiles.centerHeading,
      originPitch: responseData.tiles.originPitch,
      panoId: responseData.location.pano,
      imageDate: responseData.imageDate,
      /** @type {Array<{pano: string, Mo: Date}>} */
      time: responseData.time,
    };

    if (targetDate) {
      let nearestIdx = getNearest(targetDate, result.time);
      result.panoId = result.time[nearestIdx].pano;
    }

    return result;
  };

  this.load = function (location, callback) {
    console.log('Load for', location);
    let self = this;
    _panoClient.getPanoramaByLocation(location, 50, function (result, status) {
      if (status === google.maps.StreetViewStatus.OK) {

        if (self.onPanoramaData) {
          self.onPanoramaData(result);
        }

        // TODO: input the target date
        // let info = self.fetchPanoramaInfo(result, new Date(2014, 3));
        let info = self.fetchPanoramaInfo(result);

        rotation = info.centerHeading * Math.PI / 180.0;
        pitch = info.originPitch;
        copyright = info.copyright;
        self.copyright = info.copyright;
        _panoId = info.panoId;
        self.location = location;
        self.rotation = rotation;
        self.pitch = pitch;
        self.image_date = info.imageDate;
        self.id = _panoId;

        self.time = info.time;

        callback();
      } else {
        if (self.onNoPanoramaData) self.onNoPanoramaData(status);
        self.throwError('Could not retrieve panorama for the following reason: ' + status);
        callback();
      }
    });
  };

  this.setZoom = function (z) {
    _zoom = z;
    this.adaptTextureToZoom();
  };

  this.setZoom(_parameters.zoom || 1);

};