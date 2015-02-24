// Veda controls implemented as JQuery plugins
;(function( $ ) { "use strict";

	var render_escape = {'&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;'};
	function escape(str) {
		return str == null ? '' : (str+'').replace(/[&\"<>]/g, function(char) {
			return render_escape[char];
		});
	}
	
	// Generic control behaviour
	$.fn.vedaControl = function( $el, options ) {
		var opts = $.extend( {}, $.fn.vedaControl.defaults, options ),
			control = $(opts.template),
			view = $(".view", control),
			edit = $(".edit", control),
			add = $(".add", control),
			remove = $(".remove", control);
			
		$el
			.on("view", function () {
				view.show();
				edit.hide();
			})
			.on("edit", function () {
				view.hide();
				edit.show();
			})
			.mouseenter(function () {
				add.show();
				remove.show();
			})
			.mouseleave(function () {
				add.hide();
				remove.hide();
			})
			.on("focusin", function () {
				$el.off("mouseenter mouseleave");
				add.show();
				remove.show();
			})
			.on("focusout", function () {
				$el
					.mouseenter(function () {
						add.show();
						remove.show();
					})
					.mouseleave(function () {
						add.hide();
						remove.hide();
					});
			});

		remove
			.hide()
			.on("click", function () {
				$el.empty().remove();
				opts.remove();
			});
		add
			.hide()
			.on("click", function () {
				opts.add();
			});
		$("[bound]", control)
			.text(opts.value)
			.val(opts.value)
			.on("change", function ( e ) {
				var value = opts.inputParser( this.value, this );
				view
					.val( value )
					.text( value );
				opts.change(value);
			});	
		
		return control;
	}
	$.fn.vedaControl.defaults = {
		add: function () { alert("add") },
		remove: function () { alert("remove") },
		change: function (value) { alert(value) },
		inputParser: function (input) {return input},
		value: undefined
	}

	// String control
	$.fn.vedaString = function( options ) {
		var opts = $.extend( {}, $.fn.vedaString.defaults, options ),
			control = $.fn.vedaControl(this, opts);

		$("[bound]", control).data("language", opts.value.language);

		$(".language-selector", control).prepend(opts.value.language);

		var first = $("<li>").append( $("<a>", {href: "#", "data-language": "", text: "-"}).addClass("language") );
		if (!opts.value.language) first.addClass("active");
		$(".language-list", control).append(
			first,
			Object.keys(veda.availableLanguages).map(function (language_name) {
				var li = $("<li>"), 
					a = $("<a>", {href: "#", "data-language": language_name, text: language_name}).addClass("language");
				li.append(a);
				if (opts.value.language == language_name) li.addClass("active");
				return li;
			})
		);
		
		$(".language", control).on("click", function ( e ) {
			e.preventDefault();
			$(".language-selector", control)
				.empty()
				.append($(this).data("language"), " <span class='caret'></span>");
			$(".language-list li", control).removeClass("active");
			$(this).parent().addClass("active");
			$("textarea", control)
				.data("language", $(this).data("language") )
				.trigger("change");
		});
		
		/*$("textarea", control)
			.autosize()
			.on("focus", function (event) {
				$(this).trigger("autosize.resize");
			});*/

		this.append(control);
		return this;
	};
	$.fn.vedaString.defaults = {
		value: new String(""),
		template: $("#string-control-template").html(),
		change: function (value) { alert(value + " : " + value.language) },
		inputParser: function (input, el) {
			var value = new String(input);
			value.language = $(el).data("language");
			return value;
		}
	};
	
	// Boolean control	
	$.fn.vedaBoolean = function( options ) {
		var opts = $.extend( {}, $.fn.vedaBoolean.defaults, options ),
			control = $.fn.vedaControl(this, opts);
		this.append(control);
		return this;
	};
	$.fn.vedaBoolean.defaults = {
		value: new Boolean(false),
		template: $("#boolean-control-template").html(),
		inputParser: function (input) {
			var value = new Boolean(input == "true" ? true : false);
			return value;
		}
	};	

	// Integer control
	$.fn.vedaInteger = function( options ) {
		var opts = $.extend( {}, $.fn.vedaInteger.defaults, options ),
			control = $.fn.vedaControl(this, opts);
		this.append(control);
		return this;
	};
	$.fn.vedaInteger.defaults = {
		value: undefined,
		template: $("#integer-control-template").html(),
		inputParser: function (input) {
			var value = "", 
				int = parseInt(input, 10);
			if ( isNaN(int) == false ) value = new Number(int);
			return value;
		}
	};

	// Decimal control
	$.fn.vedaDecimal = function( options ) {
		var opts = $.extend( {}, $.fn.vedaDecimal.defaults, options ),
			control = $.fn.vedaControl(this, opts);
		this.append(control);
		return this;
	};
	$.fn.vedaDecimal.defaults = {
		value: undefined,
		template: $("#decimal-control-template").html(),
		inputParser: function (input) {
			var value = "", 
				float = parseFloat(input);
			if ( isNaN(float) == false ) value = new Number(float);
			return value;
		}
	};

	// Datetime control
	$.fn.vedaDatetime = function( options ) {
		var opts = $.extend( {}, $.fn.vedaDatetime.defaults, options ),
			control = $.fn.vedaControl(this, opts);
		this.append(control);
		return this;
	};
	$.fn.vedaDatetime.defaults = {
		value: undefined,
		template: $("#datetime-control-template").html(),
		inputParser: function (input) {
			var value = "", 
				timestamp = Date.parse(input);
			if ( isNaN(timestamp) == false ) value = new Date(timestamp);
			return value;
		}
	};
	
	// Object property control
	$.fn.vedaLink = function( options ) {
		var opts = $.extend( {}, $.fn.vedaLink.defaults, options ),
			control = $(opts.template),
			object = opts.object,
			relation = opts.relation,
			add = $(".add", control);
		
		if (!opts.add) {
			add.remove();
		} else {
			add.click(opts.add);
		}
		
		object.on("edit", function () {
			control.show();
		});
		object.on("view", function () {
			control.hide();
		});
		
		var typeAhead = $(".typeahead", control);
		var cont = $("<div>").prop("class", "list-group");
		var tmpl = new veda.IndividualModel("v-ui:LabelTemplate");
		typeAhead.popover({
			content: cont,
			html: true,
			container: "body",
			placement: "auto",
			trigger: "manual",
		});
		typeAhead.on("focusout", function (e) {
			typeAhead.popover("hide");
			typeAhead.on("focusin", function (e) {
				if (this.value && $("a", cont).length) typeAhead.popover("show");
			});
		});
		typeAhead.on("change", function (e) {
			cont.empty();
			var q = this.value;
			var tmp = $("<div>");
			var s = new veda.SearchModel(q, tmp);
			Object.getOwnPropertyNames(s.results).map( function (id) {
				var a = $("<a>", {"class": "list-group-item no-border", "href": "", "style": "display: block"}).appendTo(cont);
				var d = new veda.DocumentModel(s.results[id], a, tmpl);
				a.click(function (e) {
					e.preventDefault();
					typeAhead.popover("destroy");
					object[relation] = object[relation].concat(d);
				});
			});
			if (s.results_count) typeAhead.popover("show");
		});
		
		// Search modal
		$(".search", control).on("click", function (e) {
			var $modal = $("#search-modal");
			var search = new veda.SearchModel(undefined, $(".modal-body", $modal) );
			$modal.modal();
			// Add found values
			$("button#ok", $modal).on("click", function (e) {
				$(this).off("click");
				var selected = [];
				for (var uri in search.selected) {
					selected.push( search.selected[uri] );
				}
				object[relation] = object[relation].concat(selected);
			});
		});
		
		this.append(control);
		return this;
	};
	$.fn.vedaLink.defaults = {
		template: $("#link-control-template").html(),
		//add: function () { alert("add") },
		//change: function (value) { alert(value) },
		//inputParser: function (input) {return input},
		//value: undefined
	};

})( jQuery );
