/**
 * @class veda.IndividualActions
 * 
 * This class is used to bind additional business-logic events to individuals.
 */
veda.Module(function IndividualActions(veda) { "use strict";

	/**
	 * @returns veda.IndividualModel - start form
	 */
	function buildStartFormByTransformation(individual, transform) {
		var transfromResult = veda.Util.applyTransform(individual, transform);
		var startForm = new veda.IndividualModel();
		Object.getOwnPropertyNames(transfromResult[0]).forEach(function (key)
		{
			if (key != '@') 
			{
				startForm.defineProperty(key);
				if (!Array.isArray(transfromResult[0][key])) {
					transfromResult[0][key] = [transfromResult[0][key]];
				} 
				for (var i in transfromResult[0][key]) 
				{
					var value = null;
					if (key == 'rdf:type')
					{
						value = veda.ontology[transfromResult[0][key][i].data];
					} else  
					{
						value = transfromResult[0][key][i].hasOwnProperty('data')?new veda.IndividualModel(transfromResult[0][key][i].data):transfromResult[0][key][i];
					}
					if (value) {
						startForm[key] = startForm[key].concat(value);
					}
				}
			}
		});        
		return startForm;
	}

	function redirectToReport(individual, reportId) {
		var jasperServer = new veda.IndividualModel('v-g:jasperServerAddress');
		var jasperServerAddress = jasperServer['v-g:literalValue'][0];
		var report = new veda.IndividualModel(reportId);
		
		var form = document.createElement("form");
		form.setAttribute("method", "post");
		form.setAttribute("action", jasperServerAddress+'flow.html?_flowId=viewReportFlow&j_username=joeuser&j_password=joeuser&reportUnit='+encodeURIComponent(report['v-s:filePath'][0])+'&output='+encodeURIComponent(report['v-s:fileFormat'][0])+'&documentId='+encodeURIComponent(individual.id));
		form.setAttribute("target", "view");
		
		Object.getOwnPropertyNames(individual).forEach(function (key) 
		{
			var hiddenField = document.createElement("input"); 
			hiddenField.setAttribute("type", "hidden");
			hiddenField.setAttribute("name", key.replace(':','_'));
			hiddenField.setAttribute("value", (individual[key][0] instanceof veda.IndividualModel)?individual[key][0].id:individual[key][0]);
			form.appendChild(hiddenField);
		});
		document.body.appendChild(form);

		window.open('', 'view');

		form.submit();
	}
	
	veda.on("individual:loaded", function (individual, container, template, mode) {
		
		function sendHandler(template) {

			function validHandler() { send.removeAttr("disabled"); }
		
			function inValidHandler() { send.attr("disabled", "disabled"); }
			
			var send = template.find("#send");
			
			individual.on("valid", validHandler);
			
			individual.on("invalid", inValidHandler);
			
			/**
			 * Event `send` handler: 
			 *  - Find transformation to start form or use transformation specified by `transformId` parameter
			 *  - Apply transformation and redirect to start form. 
			 */
			individual.on("send", function (transformId) {
				if (transformId !== undefined) {
					var startForm = buildStartFormByTransformation(individual, res['v-s:hasTransformation'][0]);
	            	riot.route("#/individual/" + startForm.id + "/#main//edit", true);
				} else {
					var s = new veda.SearchModel("'rdf:type' == 'v-s:DocumentLinkRules' && 'v-s:classFrom' == '"+individual["rdf:type"][0].id+"'", null);
					if (Object.getOwnPropertyNames(s.results).length == 0) {
						if (!individual.hasValue("v-s:hasStatusWorkflow")) {
							individual.defineProperty("v-s:hasStatusWorkflow");
							individual["v-s:hasStatusWorkflow"] = [ new veda.IndividualModel("v-s:ToBeSent") ];
							$('[resource="'+individual.id+'"]').find("#save").trigger("click");
							var individualNode = $('[resource="'+individual.id+'"]');
							individualNode.find("#send").remove();
							individualNode.find("#edit").remove();
							individualNode.find("#save").remove();
							individualNode.find("#cancel").remove();
							individualNode.find("#delete").remove();
						} else {
							alert("Документ уже отправлен");
						}
					} else if (Object.getOwnPropertyNames(s.results).length == 1) {
						$('[resource="'+individual.id+'"]').find("#save").trigger("click");
						Object.getOwnPropertyNames(s.results).forEach( function (res_id) {
							var res = s.results[res_id];
							var startForm = buildStartFormByTransformation(individual, res['v-s:hasTransformation'][0]);
			            	riot.route("#/" + startForm.id + "///edit", true);
						});
					} else {
						alert('Несколько стартовых трансформаций. Меня жизнь к такому не готовила.');
					}
				}			
			});
			
			/**
			 * Event `createReport` handler: 
			 *  - Find available reports or use report specified by `reportId` parameter.
			 *  - Let user to choice report (if more then one founded)
			 *  - Redirect to report
			 */
			individual.on("createReport", function (reportId) {
				if (reportId !== undefined) {
					$('[resource="'+individual.id+'"]').find("#createReport").dropdown('toggle');
					redirectToReport(individual, reportId);
				} else {
					var s = new veda.SearchModel("'rdf:type' == 'v-s:ReportsForClass' && 'v-ui:forClass' == '"+individual["rdf:type"][0].id+"'", null);
					if (Object.getOwnPropertyNames(s.results).length == 0) {
						alert('Нет отчета. Меня жизнь к такому не готовила.');
					} else if (Object.getOwnPropertyNames(s.results).length == 1) {
						$('[resource="'+individual.id+'"]').find("#createReport").dropdown('toggle');
						redirectToReport(individual, Object.getOwnPropertyNames(s.results)[0]);
					} else {
						var reportsDropdown = $('[resource="'+individual.id+'"]').find("#chooseReport");
						if (reportsDropdown.html()== '') {
							Object.getOwnPropertyNames(s.results).forEach( function (res_id) {
								$("<li/>", {
					   			   "style" : "cursor:pointer",    
			                 	   "text" : report['rdfs:label'][0],
			                 	   "click": (function (e) {
			                 		    redirectToReport(individual, Object.getOwnPropertyNames(res_id)[0]);
			                 	   })
			                  	}).appendTo(reportsDropdown);
							});				
						}
					}
				}
			});
			
			/**
			 * Event `showRights` handler: 
			 *  - Find available reports
			 *  - Let user to choice report (if more then one founded)
			 *  - Redirect to report
			 */
			individual.on("showRights", function () {
				// Ignore individuals without id
				if (individual.id === undefined || individual.id === '' || individual.id === '_') return;
				var container = $($("#show-rights-modal-template").html());
				container.modal();

				$("body").append(container);
				
				var rights = individual['rights'];
				var holder = $("<div>");
				rights.present(holder);
				holder.appendTo($(".modal-body", container));

				var origin = individual['rightsOrigin'];						
				origin.forEach(function (rightRecord) {
					var holder = $("<div>");
					rightRecord.present(holder);
					holder.appendTo($(".modal-body", container));
				});			
			});
			
			template.on("remove", function () {
				individual.off("valid", validHandler);
				individual.off("invalid", inValidHandler);
				individual.off("send");
				individual.off("createReport");
				individual.off("showRights");
				individual.off("individual:templateReady", sendHandler);
			});
		}
		individual.on("individual:templateReady", sendHandler);
	});
});
