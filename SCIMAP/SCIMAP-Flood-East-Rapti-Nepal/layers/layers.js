var wms_layers = [];


        var lyr_GoogleSatelliteHybrid_0 = new ol.layer.Tile({
            'title': 'Google Satellite Hybrid',
            'type': 'base',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
    attributions: ' ',
                url: 'http://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'
            })
        });
var lyr_Floodsourcescores_1 = new ol.layer.Image({
                            opacity: 1,
                            title: "Flood source scores",
                            
                            
                            source: new ol.source.ImageStatic({
                               url: "./layers/Floodsourcescores_1.png",
    attributions: ' ',
                                projection: 'EPSG:3857',
                                alwaysInRange: true,
                                imageExtent: [9366137.526881, 3165653.583343, 9484533.966397, 3223025.382237]
                            })
                        });
var lyr_Floodsourcescoresheatmap_2 = new ol.layer.Image({
                            opacity: 1,
                            title: "Flood source scores - heatmap",
                            
                            
                            source: new ol.source.ImageStatic({
                               url: "./layers/Floodsourcescoresheatmap_2.png",
    attributions: ' ',
                                projection: 'EPSG:3857',
                                alwaysInRange: true,
                                imageExtent: [9366149.154338, 3165594.120819, 9484612.530593, 3222966.548480]
                            })
                        });

lyr_GoogleSatelliteHybrid_0.setVisible(true);lyr_Floodsourcescores_1.setVisible(true);lyr_Floodsourcescoresheatmap_2.setVisible(false);
var layersList = [lyr_GoogleSatelliteHybrid_0,lyr_Floodsourcescores_1,lyr_Floodsourcescoresheatmap_2];
