---
title: "Modelling and using structural and functional connectivity"
collection: talks
type: "Talk"
permalink: /talks/2018-03-01-talk-ConnectEUR
venue: "University of Palermo"
date: 2019-03-01
location: "Palermo, Italy"
---

The understanding of hydrological connectivity is often broken down into two distinct types: functional and structural (see Bracken et al 2013). Functional connectivity refers to the dynamic feedbacks that occur within the short timescale of storm events, such as surface flow dynamics and erosion – deposition of the soil surface. Structural connectivity refers to the controls that the fixed characteristics of the environment, for example, landscape topography and vegetation pattern, have on the strength of the connectivity over long time scales. This paper presents how both functional and structural connectivity can be modelled and examples of how the structural connectivity approach has been used as a key dataset within a spatial decision support system.

An approach to the representation of the structural, time integrated, hydrological and sediment connectivity is the Network Index (Lane et al. 2004). This connectivity index is derived from the analysis of a detailed digital elevation model (DEM), normally either NextMap or Lidar based dataset. The analysis is made up to two steps: Firstly, the propensity for runoff generation at each point in the landscape is calculated using the topographic wetness index (Beven and Kirkby, 1979). This calculation determines the wetness and runoff generation characteristics for each point in the landscape as a function of the upslope contributing area and the local slope gradient. The second step uses a flow path tracing algorithm to analyse the runoff transmission characteristics of the points on the downslope flow path to the river or lake. This flow tracing determines the landscape scale wetness required for each point to be capable of generating runoff and for there to be a connected pathway to the river or lake. This index gives the relative pattern of connectivity potential across the landscape.

The relative pattern of connectivity potential can be converted into long-term probabilities of connection through the use of a fully distributed landscape scale catchment hydrological simulation model (Lane et al. 2009). The CRUM3 model was used to simulate the soil moisture patterns and at each model temporal iteration (between every 50 seconds and every six hours depending on rainfall), the connected areas were calculated using the network index approach. These connections were processed to give the average amount of time each location was connected to the river channel for. These values can then be related to the network index to enable prediction of connection potentials based on the computationally efficient DEM analysis rather than the time consuming hydrological model which takes on the order of 1,000,000x longer to compute.

The Network Index has been integrated in to a decision support tool for the identification of the potential source areas of diffuse pollution, SCIMAP (Reaney et al. 2011). The SCIMAP tool uses a combination of the hydrological connectivity, the spatial pattern of sediment risk and an observed pattern of sediment concentrations. The approach has been applied to consider the impacts of diffuse pollution on in-stream ecology using salmon and trout as indicators (Reaney et al. 2011) and on geochemicals using nitrogen and phosphorus as the indicators (Milledge et al. 2012). The SCIMAP tool is freely available as a library within an open source GIS system (SAGA GIS) and is also available as a web application (http://my.scimap.org.uk). The approach is widely used within the UK by both governmental (including the Environment Agency and Natural England) and third sector groups (including many individual Rivers Trusts and community groups). These organisations are using the SCIMAP tool to target where to undertake mitigation works, such as tree planting, the creation of buffer strips and land management modifications within their catchments, to reduce the diffuse pollution pressure and move the water bodies towards attaining Good Ecological Status under the Water Framework Directive.

To simulate the temporally dynamic functional connectivity, a novel flow tracing algorithm was created based on software agents. The hydroAgent approach (Reaney 2008) traces the movement of 100,000’s of individual water molecules in response to a dynamically changing hydrological environment. The CRUM2D hydrological model (Reaney et al 2007) generated the environment and each individual hydroAgent makes its own decisions regarding its movement in response to the local hydrological conditions (the amount of water infiltrating, the flow speeds and the flow direction). This modelling approach is capable of predicting for river flow, where and when the water originally fell in the landscape as rainfall, how long it took to reach the river and the details of the flow path travelled along. This approach therefore gives a detailed insight into the functional connectivity of the water flows within the simulation model.

These approaches to modelling functional and structural connectivity have been applied in semi-arid and temperate contexts and for a range of applications. The structural connectivity index, the Network Index, has been implemented within a decision support system that is widely used within the UK. These modelling tools provide a useful experimental toolkit for investigations into the dynamics of hydrological and sediment connectivity at the small catchment to landscape scale.

www.scimap.org.uk and my.scimap.org.uk

Beven, K.J. and Kirkby, M.J. 1979. A Physically Based, Variable Contributing Area Model of Basin Hydrology; Hydrological Sciences Bulletin 24, 43-6

Bracken, L.J., Wainwright, J., Ali, G.,   Tetzlaff, D., Smith, M.W., Reaney, S. and Roy, A.G, 2013: The concepts of hydrological connectivity: research approaches, pathways and future agendas; Earth Science Reviews119 17-34 doi: http://dx.doi.org/10.1016/j.earscirev.2013.02.001

Lane S N, Reaney S M and Heathwaite A L 2009: Representation of landscape hydrological connectivity using a topographically-driven surface flow index; Water Resources Research, 45, W08423doi:10.1029/2008WR007336

Lane, S.N., Brookes, C.J., Kirkby, M.J. and Holden, J. 2004. A network-index based version of TOPMODEL for use with high-resolution digital topographic data. Hydrological Processes, 18, 191-201.

Milledge D. G., Lane S. N., Heathwaite A. L. and Reaney S. M. 2012: A Monte Carlo approach to the inverse problem of diffuse pollution risk in agricultural catchments; Science of the Total Environment 433, 434–449 http://dx.doi.org/10.1016/j.scitotenv.2012.06.047

Reaney S M 2008: The use of agent based modelling techniques in hydrology: determining the spatial and temporal origin of channel flow in semi-arid catchments. Earth Surface Processes and Landforms 33(2): 317-327

Reaney S M, Bracken (nee Bull) L J and Kirkby M J 2007: The use of the Connectivity of Runoff Model (CRUM) to investigate the Influence of Storm Characteristics on Runoff Generation and Connectivity in Semi-Arid Areas; Hydrological Processes 21 894 – 906

Reaney S. M., Lane S. N., Heathwaite A. L. and Dugdale L. J.2011: Risk-based modelling of diffuse land use impacts from rural landscapes upon salmonid fry abundance; Ecological Modelling Volume 222, Issue 4, 24 February 2011, Pages 1016-1029doi:10.1016/j.ecolmodel.2010.08.022
