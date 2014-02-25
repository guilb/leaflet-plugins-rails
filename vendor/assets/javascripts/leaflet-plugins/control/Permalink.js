L.Control.Permalink = L.Control.extend({
	includes: L.Mixin.Events, 

	options: {
		position: "bottomleft",
		useAnchor: true,
		useLocation: false,
		text: "Permalink"
	},

	initialize: function(options) {
		L.Util.setOptions(this, options);
		this._params = {};
		this._set_urlvars();
		this.on("update", this._set_center, this);
		for (var i in this) {
			if (typeof(i) === "string" && i.indexOf('initialize_') == 0)
				this[i]();
		}
	},

	onAdd: function(map) {
		this._container = L.DomUtil.create('div', 'leaflet-control-attribution leaflet-control-permalink');
		L.DomEvent.disableClickPropagation(this._container);
		this._map = map;
		this._href = L.DomUtil.create('a', null, this._container);
		this._href.innerHTML = this.options.text

		map.on('moveend', this._update_center, this);
		this.fire("update", {params: this._params})
		this._update_center();

		if (this.options.useAnchor && 'onhashchange' in window) {
			var _this = this, fn = window.onhashchange;
			window.onhashchange = function() {
				_this._set_urlvars();
				if (fn) return fn();
			}
		}

		this.fire('add', {map: map});

		return this._container;
	},

	_update_center: function() {
		if (!this._map) return;

		var center = this._round_point(this._map.getCenter());
		this._update({zoom: this._map.getZoom(), lat: center.lat, lon: center.lng});
	},

	_update_href: function() {
		var params = L.Util.getParamString(this._params);
		var sep = '?';
		if (this.options.useAnchor) sep = '#';
		var url = this._url_base + sep + params.slice(1);
		if (this._href) this._href.setAttribute('href', url);
		if (this.options.useLocation)
			location.replace('#' + params.slice(1));
		return url;
	},

	_round_point : function(point) {
		var bounds = this._map.getBounds(), size = this._map.getSize();
		var ne = bounds.getNorthEast(), sw = bounds.getSouthWest();

		var round = function (x, p) {
			if (p == 0) return x;
			shift = 1;
			while (p < 1 && p > -1) {
				x *= 10;
				p *= 10;
				shift *= 10;
			}
			return Math.floor(x)/shift;
		}
		point.lat = round(point.lat, (ne.lat - sw.lat) / size.y);
		point.lng = round(point.lng, (ne.lng - sw.lng) / size.x);
		return point;
	},

	_update: function(obj, source) {
		//console.info("Update", obj, this._params);
		for(var i in obj) {
			if (!obj.hasOwnProperty(i)) continue;
			if (obj[i] != null && obj[i] != undefined)
				this._params[i] = obj[i]
			else
				delete this._params[i];
		}

		this._update_href();
	},

	_set_urlvars: function()
	{
		this._url_base = window.location.href.split('#')[0].split('?')[0];

		var p;
		if (this.options.useAnchor)
			p = L.UrlUtil.queryParse(L.UrlUtil.hash());
		else
			p = L.UrlUtil.queryParse(L.UrlUtil.query());
		
		function eq(x, y) {
			for(var i in x)
				if (x.hasOwnProperty(i) && x[i] != y[i])
					return false;
			return true;
		}
			
		if (eq(p, this._params) && eq(this._params, p))
			return;
		this._params = p;
		this._update_href();
		this.fire("update", {params: this._params})
	},

	_set_center: function(e)
	{
		//console.info("Update center", e);
		var params = e.params;
		if (params.zoom == undefined ||
		    params.lat == undefined ||
		    params.lon == undefined) return;
		this._map.setView(new L.LatLng(params.lat, params.lon), params.zoom);
	}
});

L.UrlUtil = {
	queryParse: function(s) {
		var p = {};
		var sep = "&";
		if (s.search("&amp;") != -1)
			sep = "&amp;";
		var params = s.split(sep);
		for(var i = 0; i < params.length; i++) {
			var tmp = params[i].split('=');
			if (tmp.length != 2) continue;
			p[tmp[0]] = decodeURI(tmp[1]);
		}
		return p;
	},

	query: function() {
		var href = window.location.href.split('#')[0], idx = href.indexOf('?');
		if (idx < 0)
			return '';
		return href.slice(idx+1);
	},

	hash: function() { return window.location.hash.slice(1) },

	updateParamString: function (q, obj) {
		var p = L.UrlUtil.queryParse(q);
		for (var i in obj) {
			if (obj.hasOwnProperty(i))
				p[i] = obj[i];
		}
		return L.Util.getParamString(p).slice(1);
	}
};

L.Control.Permalink.include({
	/*
	options: {
		line: null
	},
	*/

	initialize_line: function() {
		this.on('update', this._set_line, this);
		this.on('add', this._onadd_line, this);
	},

	_onadd_line: function(e) {
		//console.info("onAdd::line", e);
		if (!this.options.line) return;
		this.options.line.on('edit', this._update_line, this);
		this._update_line()
	},

	_update_line: function() {
		if (!this.options.line) return;
		var line = this.options.line;
		if (!line) return;
		var text = [], coords = line.getLatLngs();
		if (!coords.length)
			return this._update({line: null});
		for (var i in coords)
			text.push(coords[i].lat.toFixed(4) + "," + coords[i].lng.toFixed(4))
		this._update({line: text.join(';')});
	},

	_set_line: function(e) {
		//console.info("Set line", e.params.line);
		var p = e.params, l = this.options.line;
		if (!l || !p.line) return;
		var coords = [], text = p.line.split(';');
		for (var i in text) {
			var ll = text[i].split(',');
			if (ll.length != 2) continue;
			coords.push(new L.LatLng(ll[0], ll[1]));
		}
		if (!coords.length) return;
		l.setLatLngs(coords);
		if (!this._map.hasLayer(l))
			this._map.addLayer(l);
	}
});


L.Control.Permalink.include({
	/*
	options: {
		useMarker: true,
		markerOptions: {}
	},
	*/

	initialize_layer: function() {
		//console.info("Initialize layer");
		this.on('update', this._set_layer, this);
		this.on('add', this._onadd_layer, this);
	},

	_onadd_layer: function(e) {
		//console.info("onAdd::layer", e);
		this._map.on('layeradd', this._update_layer, this);
		this._map.on('layerremove', this._update_layer, this);
		this._update_layer();
	},

	_update_layer: function() {
		if (!this.options.layers) return;
		//console.info(this.options.layers);
		var layer = this.options.layers.currentBaseLayer();
		if (layer)
			this._update({layer: layer.name});
	},

	_set_layer: function(e) {
		//console.info("Set layer", e);
		var p = e.params;
		if (!this.options.layers || !p.layer) return;
		this.options.layers.chooseBaseLayer(p.layer);
	}
});

L.Control.Layers.include({
	chooseBaseLayer: function(name) {
		var layer, obj;
		for (var i in this._layers) {
			if (!this._layers.hasOwnProperty(i))
				continue;
			obj = this._layers[i];
			if (!obj.overlay && obj.name == name)
				layer = obj.layer;
		}
		if (!layer || this._map.hasLayer(layer))
			return;

		for (var i in this._layers) {
			if (!this._layers.hasOwnProperty(i))
				continue;
			obj = this._layers[i];
			if (!obj.overlay && this._map.hasLayer(obj.layer))
				this._map.removeLayer(obj.layer)
		}
		this._map.addLayer(layer)
		this._update();
	},

	currentBaseLayer: function() {
		for (var i in this._layers) {
			if (!this._layers.hasOwnProperty(i))
				continue;
			var obj = this._layers[i];
			//console.info("Layer: ", obj.name, obj);
			if (obj.overlay) continue;
			if (!obj.overlay && this._map.hasLayer(obj.layer))
				return obj;
		}
	}
});

L.Control.Permalink.include({
	/*
	options: {
		useMarker: true,
		markerOptions: {}
	},
	*/

	initialize_marker: function() {
		//console.info("Initialize marker");
		this.on('update', this._set_marker, this);
	},

	_set_marker: function(e) {
		//console.info("Set marker", e);
		var p = e.params;
		//if (!this.options.useMarker) return;
		if (this._marker) return;
		if (p.marker != 1) return;
		if (p.mlat !== undefined && p.mlon !== undefined)
			return this._update({mlat: null, mlon: null,
					lat: p.mlat, lon: p.mlon, marker: 1});
		this._marker = new L.Marker(new L.LatLng(p.lat, p.lon),
						this.options.markerOptions);
		this._marker.bindPopup("<a href='" + this._update_href() + "'>" + this.options.text + "</a>");
		this._map.addLayer(this._marker);
		this._update({marker: null});
	}
});