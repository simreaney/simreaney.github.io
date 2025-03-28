---
title: "Web based SCIMAP"
date: "2016-01-20"
coverImage: "Figure2.png"
collection: portfolio
excerpt: Enabling access to non-point source risk mapping tools using Open Source Software and Open Geospatial Consortium (OGC) standards: the development of the SCIMAP WebApp
---
# Enabling access to non-point source risk mapping tools using Open Source Software and Open Geospatial Consortium (OGC) standards: the development of the SCIMAP WebApp

Sim Reaney<sup>1</sup> and Peter Wells<sup>2</sup>

(1): Department of Geography, Durham University, Durham, DH1 3LE, UK (2): Lutra Consulting, Burgess Hill, West Sussex, RH15 8HN, UK

Non-point (diffuse) pollution is a key environmental pressure effecting water quality and ecology in lakes and rivers. Many governmental and NGO bodies are working to tacking the problem but their efforts are constrained by the complexities of the problem. To enable the spatial targeting of the mitigation measures at the landscape scale, the SCIMAP risk mapping approach was developed by Durham and Lancaster Universities in the UK. The approach was well received but the desktop implementation created problems for users.  NGO users generally did not have the required datasets or GIS skills. Governmental users within a corporate managed IT environment were not able to install the desktop software. Using web based technologies, it has been possible to overcome the problems faced by both sets of users.

The SCIMAP WebApp is a rich internet application consisting of a GIS user interface that allows users to easily generate risk maps for diffuse pollution. All the calculation and modelling procedures are completely linked and automated, the calculation of the risk maps be achieved in a more efficient and timely manner, and therefore contributing to improve decision-making. The application is a web-based and can be accessed through most of the modern web browsers. The web application was entirely developed using Open Source Software and OGC standards.

A custom module was developed for GRASS GIS to simulate hydrological mechanisms involved in diffuse pollution. Users can use available data on topography and land cover and parameter sets within the SCIMAP spatial database or can also upload local data. The input data are passed to the server-side of the SCIMAP application to run simulation. Simulation time has been optimised within the GRASS module. Results are shown on the client-side of the application or alternatively, can be downloaded and imported to Desktop GIS or any kml based viewer.

## Introduction

Non-point (diffuse) pollution is a key environmental pressure effecting water quality and ecology in lakes and rivers. In 2012 only 28% of the water bodies in England were meeting their EU Water Framework Directive target of ‘good ecological status’ (GES) and of those sites that are failing, 67% cite non-point source pollution of nutrients and fine sediment as an important pressure causing the failure of the waterbody to meet its good ecological status. Many governmental and non-Governmental Organisations (NGO) are working to tackle the problem but their efforts are constrained by the complexities of the problem. The diffuse pollution processes are occurring over large spatial areas (landscape scale, typically over 1000km2 per management catchment) and intermittently in time in response to storm events and changing land management on a year-to-year basis. These problems are coupled with the limited funds available to target and implement mitigating actions in the landscape. Therefore, it is important to be able to spatially target these mitigation measures in the landscape for the best return on this investment, leading to a more confident improvement in a waterbody’s GES.

## The SCIMAP Framework

To enable the spatial targeting of the mitigation measures at the landscape scale, a risk-mapping tool (SCIMAP) was developed by Durham and Lancaster Universities in the UK (Reaney et al. 2011, Milledge et al. 2013). SCIMAP is based on the identification of locations of critical source areas (Heathwaite et al., 2005) within the landscape. These locations are based on the areas that are most likely to have a source of the pollutant of interest and an active connection (surface pathway) with a water course. SCIMAP creates maps of these two key factors, the source risks and the hydrological connectivity, at landscape extent and at a fine spatial resolution (normally 5m). This pair of maps is then integrated to give maps of the spatial distribution of likely diffuse pollution source areas and how the spatial structure of the landscape influences the accumulation and dilution of the diffuse pollution risk.

### Determining Source Risks

The land cover type and the local erosion potential determine the source risk for diffuse pollution. The land cover based risk generation coefficients can be determined in one of two ways. The first way, ‘SCIMAP Standard’, utilizes a logical set of weightings between different land covers based on the amount of time that there is bare soil during the year and amount of artificial fertilizer or manure which is applied, Table 1. The second way, ‘SCIMAP Fitted’, uses a spatially monitored or observed dataset of the pollutant, chemical or species of interest to fit the spatial pattern of diffuse pollution to the observed spatial distribution. This approach recognizes the issues with parameter equality and hence takes a GLUE (Beven and Bingley 1992) / Monte Carlo based approach to test many thousands of different land cover parameter sets. Full details are in Reaney et al. (2011) and Milledge et al. (2013).

The local erosion potential is determined with a stream power equation which considers the amount of water that is likely to pass through a point and the local slope gradient, which will provide the energy to drive faster, more erosive flows:

_Er = a.s_

Where _Er_ is the erosion potential, _a_ is the upslope contributing area and _s_ is the local slope gradient.

### Determining Hydrological Connectivity

The connectivity predictions are based on the Network Index (Lane et al., 2004) which traces each individual flow path across the landscape to determine how wet the landscape must be to both generate runoff and connect to the river channel. The SCIMAP standard approach utilises the topographic wetness index (Beven and Kirkby, 1979) to make spatial predictions of soil moisture but these maps can be based on observations or physically-based hydrological model simulations for the SCIMAP fitted version (Lane et al., 2009). It is important to ensure that the assumptions embedded within the predictions of patterns of soil moisture, connectivity and source risks, match with the environment under study.

### Integrating Sources and Connectivity to Produce Risk Maps

SCIMAP produces individual maps of sources and connectivity that can then be combined to give an ‘at a point’ diffuse pollution risk. These risks are then routed and accumulated through the landscape to show how the risks from different parts of the landscape combine and increase the further downstream/catchment as a risk load in the river channel or lake. These risk loads are then diluted using the accumulated, rainfall weighted, catchment area to give the final map in figure 1. This map shows in red, the areas where the risks from diffuse pollution are accumulating faster than there is water to dilute them and the areas in green are when there is more dilution than risk. In the case of the catchment in Figure 1, it is the areas highlighted in red where a land manager would target their ground investigation or mitigation actions first. The fine spatial resolution of the approach of 5m, means that the erosion risk and connectivity predictions are at the sub-field scale and hence the manager can target measures at this fine spatial scale.

![Figure1](Figure1.png)
Figure One: Example data layers from SCIMAP applied to the Morland catchment, Cumbria, UK

The approach has been well received and used by both the Environment Agency in the UK and various NGO’s, including the Rivers Trusts and Wildlife Trusts, who have used SCIMAP to target their implementation work. SCIMAP was originally implemented using an Open Source GIS system (SAGA GIS) but this desktop implementation created problems for users. NGO users generally did not have the required datasets or GIS skills to pre-process the datasets. Governmental users within a corporate managed IT environment were not able to install the desktop software on their own machines. A final issue arose from requests to support multiple operating systems (Windows, both 32 and 64 bit, OS X and Linux). These problems were key barriers to further uptake of the SCIMAP approach. It has been possible to overcome the problems faced by both sets of users using web based technologies to develop the SCIMAP WebApp.

## The SCIMAP WebApp

The SCIMAP WebApp is an internet application featuring a simple GIS user interface allowing users to easily access, setup and generate risk maps for diffuse pollution using the SCIMAP approach. All the calculation and modelling procedures are completely linked and automated and the calculation of risk maps is achieved in an efficient and timely manner therefore contributing to improved decision-making.

The application is a web-based tool and can be accessed through most modern web browsers. The web application was entirely developed using Open Source Software and Open Geospatial Consortium (OGC) standards.

### Features

The SCIMAP WebApp user interface is intuitive and process-driven. It allows users with little or no GIS experience to define their study area by simply clicking on a background map. SCIMAP then calculates the area draining to that point and displays it in an interactive map. Uploading an existing study area is also supported.

![Figure2](Figure2.png)

Figure Two: Creating a new catchment.

The SCIMAP WebApp allows the user to specify simple tabular-based risk weighting parameters for SCIMAP ‘standard’ simulations as well as field observations for SCIMAP ‘fitted’ simulations. Users can either upload a set of existing field observations or simply define them by clicking on the map to add new sample records.

With the various inputs now defined the user can specify and initiate a new SCIMAP simulation. The simulation takes place on the server with its progress being displayed in the user’s web browser. When the simulation is completed the results can either be displayed interactively in the web browser or downloaded for use in Desktop GIS systems or kml-based viewers such as Google Earth.

## Implementation

The front-end (user interface) of the SCIMAP WebApp is based on the GeoExt library, a fusion of OpenLayers (a JavaScript-based library for displaying maps in the web browser) and ExtJS (a JavaScript framework for rich web applications).

The process of creating hydrological catchments (along with many other SCIMAP processes) is performed as a Web Processing Service (WPS) and implemented using PyWPS (a python-based WPS server). Various GRASS GIS modules were chained together to form the catchment delineation functionality. PyWPS has excellent support for calling GRASS modules from python which allows powerful GIS functionality to be developed with relative ease. Existing study areas uploaded by the user are read and processed using GDAL (the Geospatial Data Abstraction Library).

The addition and editing of observation sample points is handled using the transactional Web Feature Service (WFS-T). Observation data is then stored on the server in PostGIS-enabled database.

All WPS processes in the WebApp take place asynchronously meaning that the user may close their web browser and the process will continue uninterrupted . The majority of the original SCIMAP SAGA module has been implemented as a series of chained GRASS GIS modules with only one new GRASS module developed to calculate the Network Index for hydrological connectivity (Lane et al., 2004).

Implementation of core SCIMAP processes as GRASS (6.x) modules has significantly reduced simulation times. GRASS offers excellent raster processing performance for large datasets which is set to improve in the upcoming release of GRASS 7.

 

![Figure3](Figure3.png)

Figure Three: SCIMAP WebApp high-level architecture.

## Summary

SCIMAP is a non-point source (diffuse) pollution risk mapping tool that allows for the spatial targeting of mitigation measures at the landscape extent but at a sub-field spatial scale. The approach has been used by government agencies (e.g. Environment Agency, Natural England) and non-governmental organisation (e.g. Rivers Trust) in the UK but both types of users encountered problems with GIS data handling and installation of software on managed or diverse IT platforms. These problems have been addressed through the use of web-based GIS technologies to provide an intuitive and user-friendly interface to SCIMAP that does not require the user to install any software. The SCIMAP WebApp uses OGC web services to allow complex GIS tasks (including editing and processing server-side datasets) to be carried out in the user’s web browser. The new system that was developed has increased the access to the toolset and hence will allow for more stakeholders to use SCIMAP in their work planning and decision making.

 
This work has been funded by Durham University, The Rivers Trust (UK) and the Environment Agency (UK). The original SCIMAP research was funded by NERC and the Environment Agency.

Reaney S. and Wells P. 2014: Enabling access to non-point source risk mapping tools using Open Source Software and Open Geospatial Consortium (OGC) standards: the development of the SCIMAP WebApp; _Proceedings of the 11th International Conference on Hydroinformatics_, New York, USA, August 17-21, 2014. ISBN : 978-0-692-28129-1

Details of the SCIMAP approach: [www.scimap.org.uk](http://www.scimap.org.uk)


## References

1. Beven, K. J. and Kirkby, M. J. (1979) A physically based, variable contributing area model of basin hydrology, Hydrological Sciences Bulletin 24, 43–69.
2. Beven, K.J. and Binley, A.M., 1992. The future of distributed models: model calibration and uncertainty prediction, Hydrological Processes, 6, 279–298.
3. Heathwaite, AL, Quinn, PF and Hewett, CJM (2005) Modelling and managing critical source areas of diffuse pollution from agricultural land using flow connectivity simulation; Journal of Hydrology 304, 446-461 DOI: 10.1016/j.jhysrol.2004.07.043.
4. Lane, S. N., Brookes, C. J., Kirkby, M. J. & Holden, J. (2004) A network-index-based version of TOPMODEL for use with high-resolution digital topographic data. Hydrol. Process. 18, 191–201. doi: 10.1002/hyp.5208.
5. Lane, S.N., Reaney, S.M. & Heathwaite, A.L. (2009) Representation of landscape hydrological connectivity using a topographically driven surface flow index. Water Resources Research. 45, W08423.
6. Milledge D. G., Lane S. N., Heathwaite A. L. and Reaney S. M. (2012) A Monte Carlo approach to the inverse problem of diffuse pollution risk in agricultural catchments. Science of the Total Environment 433, 434-449. http://dx.doi.org/10.1016/j.scitotenv.2012.06.047
7. Reaney S. M., Lane S. N., Heathwaite A. L. and Dugdale L. J. (2011) Risk-based modelling of diffuse land use impacts from rural landscapes upon salmonid fry abundance. Ecological Modelling 222, 1016-1029.
