/*global L: true */

L.GPX = L.FeatureGroup.extend({
	initialize: function(gpx, options) {
		L.Util.setOptions(this, options);
		this._gpx = gpx;
		this._layers = {};
		
		if (gpx) {
			this.addGPX(gpx, options, this.options.async);
		}
	},
	
	loadXML: function(url, cb, options, async) {
		if (async == undefined) async = this.options.async;
		if (options == undefined) options = this.options;

		var req = new window.XMLHttpRequest();
		req.open('GET', url, async);
		try {
			req.overrideMimeType('text/xml'); // unsupported by IE
		} catch(e) {}
		req.onreadystatechange = function() {
			if (req.readyState != 4) return;
			if(req.status == 200) cb(req.responseXML, options);
		};
		req.send(null);
	},

	_humanLen: function(l) {
		if (l < 2000)
			return l.toFixed(0) + " m";
		else
			return (l/1000).toFixed(1) + " km";
	},
	
	_polylineLen: function(line)//line is a L.Polyline()
	{
		var ll = line._latlngs;
		var d = 0, p = null;
		for (var i = 0; i < ll.length; i++)
		{
			if(i && p)
				d += p.distanceTo(ll[i]);
			p = ll[i];
		}
		return d;
	},

	addGPX: function(url, options, async) {
		var _this = this;
		var cb = function(gpx, options) { _this._addGPX(gpx, options) };
		this.loadXML(url, cb, options, async);
	},

	_addGPX: function(gpx, options) {
		var layers = this.parseGPX(gpx, options);
		if (!layers) return;
		this.addLayer(layers);
		this.fire("loaded");
	},	

	parseGPX: function(xml, options) {
		var j, i, el, layers = [];
		var named = false, tags = [['rte','rtept'], ['trkseg','trkpt']];

		for (j = 0; j < tags.length; j++) {
			el = xml.getElementsByTagName(tags[j][0]);
			for (i = 0; i < el.length; i++) {
				var l = this.parse_trkseg(el[i], xml, options, tags[j][1]);
				for (var k = 0; k < l.length; k++) {
					if (this.parse_name(el[i], l[k])) named = true;
					layers.push(l[k]);
				}
			}
		}

		el = xml.getElementsByTagName('wpt');
		if (options.display_wpt != false) {
			for (i = 0; i < el.length; i++) {
				var l = this.parse_wpt(el[i], xml, options);
				if (!l) continue;
				if (this.parse_name(el[i], l)) named = true;
				layers.push(l);
			}
		}

		if (!layers.length) return;
		var layer = layers[0];
		if (layers.length > 1) 
			layer = new L.FeatureGroup(layers);
		if (!named) this.parse_name(xml, layer);
		return layer;
	},

	parse_name: function(xml, layer) {
		var i, el, txt="", name, descr="", len=0;
		el = xml.getElementsByTagName('name');
		if (el.length)
			name = el[0].childNodes[0].nodeValue;
		el = xml.getElementsByTagName('desc');
		for (i = 0; i < el.length; i++) {
			for (var j = 0; j < el[i].childNodes.length; j++)
				descr = descr + el[i].childNodes[j].nodeValue;
		}

		if(layer instanceof L.Path)
			len = this._polylineLen(layer);

		if (name) txt += "<h2>" + name + "</h2>" + descr;
		if (len) txt += "<p>" + this._humanLen(len) + "</p>";
		
		if (layer && layer._popup === undefined) layer.bindPopup(txt);
		return txt;
	},

	parse_trkseg: function(line, xml, options, tag) {
		var el = line.getElementsByTagName(tag);
		if (!el.length) return [];
		var coords = [];
		for (var i = 0; i < el.length; i++) {
			var ll = new L.LatLng(el[i].getAttribute('lat'),
						el[i].getAttribute('lon'));
			ll.meta = {};
			for (var j in el[i].childNodes) {
				var e = el[i].childNodes[j];
				if (!e.tagName) continue;
				ll.meta[e.tagName] = e.textContent;
			}
			coords.push(ll);
		}
		var l = [new L.Polyline(coords, options)];
		this.fire('addline', {line:l})
		return l;
	},

	parse_wpt: function(e, xml, options) {
		var m = new L.Marker(new L.LatLng(e.getAttribute('lat'),
						e.getAttribute('lon')), options);
		this.fire('addpoint', {point:m});
		return m;
	}
});

(function() {

function d2h(d) {
	var hex = '0123456789ABCDEF';
	var r = '';
	d = Math.floor(d);
	while (d != 0) {
		r = hex[d % 16] + r;
		d = Math.floor(d / 16);
	}
	while (r.length < 2) r = '0' + r;
	return r;
}

function gradient(color) {
	// First arc (0, PI) in HSV colorspace
	function f2h(d) { return d2h(256 * d); }
	if (color < 0)
		return "#FF0000";
	else if (color < 1.0/3)
		return "#FF" + f2h(3 * color) + "00";
	else if (color < 2.0/3)
		return "#" + f2h(2 - 3 * color) + "FF00";
	else if (color < 1)
		return "#00FF" + f2h(3 * color - 2);
	else
		return "#00FFFF";
};

function gpx2time(s) {
	// 2011-09-24T12:07:53Z
	if (s.length != 10 + 1 + 8 + 1)
		return new Date();
	return new Date(s);
};

L.GPX.include({
	options: {
		maxSpeed: 110,
		chunks: 200
	},

	speedSplitEnable: function(options) {
		L.Util.setOptions(this, options);
		return this.on('addline', this.speed_split, this);
	},

	speedSplitDisable: function() {
		return this.off('addline', this.speed_split, this);
	},

	speed_split: function(e) {
		var l = e.line.pop(), ll = l.getLatLngs();
		var chunk = Math.floor(ll.length / this.options.chunks);
		if (chunk < 3) chunk = 3;
		var p = null;
		for (var i = 0; i < ll.length; i += chunk) {
			var d = 0, t = null;
			if (i + chunk > ll.length)
				chunk = ll.length - i;
			for (var j = 0; j < chunk; j++) {
				if (p) d += p.distanceTo(ll[i+j]);
				p = ll[i + j];
				if (!t) t = gpx2time(p.meta.time);
			}
			p = ll[i + chunk - 1];
			t = (gpx2time(p.meta.time) - t) / (3600 * 1000);
			var speed = 0.001 * d / t;
			//console.info('Dist: ' + d + "; Speed: " + speed);
			var color = gradient(speed / this.options.maxSpeed);
			var l = new L.Polyline(ll.slice(i, i+chunk+1), {color: color, weight: 2, opacity: 1});
			l.bindPopup('Dist: ' + d.toFixed() + "m; Speed: " + speed.toFixed(2) + " km/h");
			e.line.push(l);
		}
	}

});
})();
