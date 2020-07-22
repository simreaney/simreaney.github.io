var wms_layers = [];


        var lyr_GoogleMaps_0 = new ol.layer.Tile({
            'title': 'Google Maps',
            'type': 'base',
            'opacity': 1.000000,
            
            
            source: new ol.source.XYZ({
    attributions: ' ',
                url: 'http://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
            })
        });
var lyr_Catch_ID_26C_NetWet_1 = new ol.layer.Image({
                            opacity: 1,
                            title: "Catch_ID_26C_NetWet",
                            
                            
                            source: new ol.source.ImageStatic({
                               url: "./layers/Catch_ID_26C_NetWet_1.png",
    attributions: ' ',
                                projection: 'EPSG:3857',
                                alwaysInRange: true,
                                imageExtent: [-931267.412811, 7095629.412874, -832549.709483, 7174975.206386]
                            })
                        });

lyr_GoogleMaps_0.setVisible(true);lyr_Catch_ID_26C_NetWet_1.setVisible(true);
var layersList = [lyr_GoogleMaps_0,lyr_Catch_ID_26C_NetWet_1];
