var GSVPANO = GSVPANO || {};

/**
 *
 * @param {Date} target
 * @param {Array<{pano: string, On: Date}>} timePanos
 */
const getNearest = (target, timePanos) => {
  try {
    let ty = target.getFullYear();
    let tm = target.getMonth();
    let dates = timePanos?.map(x => {
      return [x.On.getFullYear(), x.On.getMonth()];
    }) ?? [];
    let values = Array(dates.length);
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      values[i] = Math.abs((date[1] - tm) + ((date[0] - ty) * 12));
    }

    return values.indexOf(Math.min(...values));
  } catch (e) {
    return 0;
  }
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
    let self = this;

    console.log('Loading panorama for zoom ' + _zoom + '...');

    let w = (_zoom == 3) ? 7 : Math.pow(2, _zoom);
    let h = Math.pow(2, _zoom - 1);

    _count = 0;
    _total = w * h;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let url = 'https://maps.google.com/cbk?output=tile&panoid=' + panoId + '&zoom=' + _zoom + '&x=' + x + '&y=' + y + '&' + Date.now();
        (function (xx, yy, targetUrl) {
          let img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = targetUrl;

          img.addEventListener('load', async function () {
            await self.composeFromTile(xx, yy, this);
          });
          img.addEventListener('error', async function () {
            await self.composeFromTile(xx, yy, new Image());
          });
        })(x, y, url);
      }
    }
  };

  /**
   * @param {Object} responseData
   * @param {Date?} targetDate
   * @return {{panoId: *, imageDate, time: Array<{pano: string, Mo: Date}>, centerHeading, originPitch}}
   */
  this.fetchPanoramaInfo = (responseData, targetDate) => {
    let result = {
      centerHeading: responseData.tiles.centerHeading,
      originPitch: responseData.tiles.originPitch,
      panoId: responseData.location.pano,
      imageDate: responseData.imageDate,
      /** @type {Array<{pano: string, Mo: Date}>} */
      time: responseData.time,
    };

    if (!!targetDate) {
      let nearestIdx = 0;
      try {
        nearestIdx = getNearest(targetDate, result.time);
        result.panoId = result.time[nearestIdx].pano;
      } catch (e) {
        console.error(e);
        result.panoId = responseData.location.pano;
      }
    }

    return result;
  };

  this.load = function (location, targetDate, callback) {
    console.log('Load for', location, targetDate?.toJSON());
    let self = this;
    _panoClient.getPanoramaByLocation(location, 50, function (result, status) {
      if (status === google.maps.StreetViewStatus.OK) {
        if (self.onPanoramaData) {
          self.onPanoramaData(result);
        }
        console.log(`date: ${targetDate}`);
        let info = self.fetchPanoramaInfo(result, targetDate);
        console.log(`info: ${JSON.stringify(info)}`);
        // let info = self.fetchPanoramaInfo(result);

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