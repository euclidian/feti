define([
    'text!static/feti/js/scripts/templates/searchbar.html',
    'common',
    '/static/feti/js/scripts/collections/occupation.js',
    '/static/feti/js/scripts/collections/campus.js',
    '/static/feti/js/scripts/collections/course.js',
    '/static/feti/js/scripts/collections/favorites.js'
], function (searchbarTemplate, Common, occupationCollection, campusCollection, courseCollection, favoritesCollection) {
    var SearchBarView = Backbone.View.extend({
        tagName: 'div',
        container: '#map-search',
        template: _.template(searchbarTemplate),
        events: {
            'click #where-to-study': '_categoryClicked',
            'click #what-to-study': '_categoryClicked',
            'click #choose-occupation': '_categoryClicked',
            'click #favorites': '_categoryClicked',
            'click #result-toogle': 'toogleResult',
            'click #location': 'locationFilterSelected',
            'click #draw-polygon': 'drawModeSelected',
            'click #draw-circle': 'drawModeSelected',
            'click #cancel-location': 'cancelLocationClicked',
            'click #cancel-draw-polygon': 'cancelDrawClicked',
            'click #cancel-draw-circle': 'cancelDrawClicked',
            'click #clear-draw': 'clearAllDraw'
        },
        initialize: function (options) {
            this.render();
            this.$result_toggle = $('#result-toogle');
            this.$search_bar = $(".search-bar");
            this.$search_bar_input = $("#search-bar-input");
            this.$search_form = $("#search-form");
            this.$provider_button = $("#where-to-study");
            this.$course_button = $("#what-to-study");
            this.$occupation_button = $("#choose-occupation");
            this.$favorites_button = $("#favorites");
            this.$clear_draw = $("#clear-draw");

            this.search_bar_hidden = true;
            this.$result_toggle.hide();
            this.parent = options.parent;
            this.initAutocomplete();
            Common.Dispatcher.on('search:finish', this.onFinishedSearch, this);
            Common.Dispatcher.on('occupation:clicked', this.occupationClicked, this);
            Common.Dispatcher.on('favorites:added', this._favoriteAdded, this);
            Common.Dispatcher.on('favorites:deleted', this._favoriteDeleted, this);

            this._drawer = {
                polygon: this._initializeDrawPolygon,
                circle: this._initializeDrawCircle
            };
            this._addResponsiveTab($('.nav.nav-tabs'));
            this._search_query = {};
            this._search_filter = {};
            this._search_results = {};
            this._search_need_update = {
                'provider' : false,
                'course': false,
                'favorite': false
            };

            var that = this;

            this.$search_form.submit(function (e) {
                that.updateSearchRoute();
                e.preventDefault(); // avoid to execute the actual submit of the form.
            });
        },
        render: function () {
            this.$el.empty();
            var attributes = {
                'is_logged_in' : Common.IsLoggedIn
            };
            this.$el.html(this.template(attributes));
            $(this.container).append(this.$el);
        },
        initAutocomplete: function () {
            var that = this;
            this.$search_bar_input.autocomplete({
                source: function (request, response) {
                    that.$search_bar_input.css("cursor", "wait");
                    var url = "/api/autocomplete/" + Common.CurrentSearchMode;
                    $.ajax({
                        url: url,
                        data: {
                            q: request.term
                        },
                        success: function (data) {
                            that.$search_bar_input.css("cursor", "");
                            response(data);
                        },
                        error: function (request, error) {
                            that.$search_bar_input.css("cursor", "");
                        }
                    });
                },
                minLength: 3,
                select: function (event, ui) {
                    $(this).val(ui.item.value);
                    $("#search-form").submit()
                },
                open: function () {
                    //$(this).removeClass("ui-corner-all").addClass("ui-corner-top");
                },
                close: function () {
                    //$(this).removeClass("ui-corner-top").addClass("ui-corner-all");
                }
            });
            var width = this.$search_bar_input.css('width');
            $('.ui-autocomplete').css('width', width);
        },
        getSearchRoute: function (filter) {
            var that = this;
            var new_url = ['map'];
            var mode = Common.CurrentSearchMode;
            if (mode == "occupation") {
                this.clearAllDrawWithoutRouting();
                this.disableFilterResult();
            } else {
                this.enableFilterResult();
            }

            var query = that.$search_bar_input.val();
            if(!query && mode in this._search_query) {
                query = this._search_query[mode];
            }
            if(query=="" && mode!='favorites') {
                this.parent.closeResultContainer($('#result-toogle'));
            }
            new_url.push(mode);
            new_url.push(query);

            if (filter) {
                new_url.push(filter);
            } else {
                // Get coordinates query from map
                var coordinates = this.parent.getCoordinatesQuery();
                if (coordinates) {
                    new_url.push(coordinates);
                }
            }
            return new_url;
        },
        updateSearchRoute: function (filter) {
            // update route based on query and filter
            var new_url = this.getSearchRoute(filter);
            Backbone.history.navigate(new_url.join("/"), true);
        },
        _categoryClicked: function (event) {
            event.preventDefault();
            if(!$(event.target).parent().hasClass('active')) {
                this.trigger('categoryClicked', event);
                var mode = $(event.target).parent().data("mode");
                this.changeCategoryButton(mode);
                this.$search_bar_input.val('');
                this.updateSearchRoute();
                if(mode == 'favorites') {
                    this._openFavorites();
                } else {
                    $('.search-row').show();
                }
            }
        },
        _favoriteAdded: function (mode) {
            for (var key in this._search_need_update) {
                if (this._search_need_update.hasOwnProperty(key)) {
                    if (key != mode) {
                        this._search_need_update[key] = true;
                    }
                }
            }
        },
        _favoriteDeleted: function (mode) {
            if(mode == 'favorites') {
                this._getFavorites();
            }
            for (var key in this._search_need_update) {
                if (this._search_need_update.hasOwnProperty(key)) {
                    if (key != mode && key != 'favorites') {
                        this._search_need_update[key] = true;
                    }
                }
            }
        },
        _openFavorites: function() {
            $('.search-row').hide();
            this.showResult();
            if(!('favorites' in this._search_query) || this._search_need_update['favorites']) {
                this._getFavorites();
            }
        },
        _getFavorites: function () {
            var mode = 'favorites';
            favoritesCollection.search();
            this._search_query[mode] = '';
            this._search_filter[mode] = '';
            Common.Dispatcher.trigger('sidebar:show_loading', mode);
            this._search_need_update['favorites'] = false;
        },
        occupationClicked: function (id, pathway) {
            Common.Router.inOccupation = true;
            var new_url = this.getSearchRoute();
            new_url.push(id);
            if (pathway) {
                new_url.push(pathway);
            }
            Backbone.history.navigate(new_url.join("/"), false);
        },
        search: function (mode, query, filter) {
            this.$search_bar_input.val(query);
            if(query) {
                if (!filter) {
                    this.clearAllDraw();
                } else {
                    var filters = filter.split('&');

                    if (filters[0].split('=').pop() == 'polygon') { // if polygon
                        var coordinates_json = JSON.parse(filters[1].split('=').pop());
                        var coordinates = [];
                        _.each(coordinates_json, function (coordinate) {
                            coordinates.push([coordinate.lat, coordinate.lng]);
                        });
                        this.parent.createPolygon(coordinates);
                    } else if (filters[0].split('=').pop() == 'circle') { // if circle
                        var coords = JSON.parse(filters[1].split('=').pop());
                        var radius = filters[2].split('=').pop();
                        this.parent.createCircle(coords, radius);
                    }
                }

                // search
                if(query == this._search_query[mode] && filter == this._search_filter[mode] && !this._search_need_update[mode]) {
                    // no need to search
                    if(query!="") {
                        this.showResult(mode);
                    }
                } else {
                    switch (mode) {
                        case 'provider':
                            campusCollection.search(query, filter);
                            break;
                        case 'course':
                            courseCollection.search(query, filter);
                            break;
                        case 'occupation':
                            occupationCollection.search(query);
                            break;
                        default:
                            return;
                    }
                    this._search_query[mode] = query;
                    this._search_filter[mode] = filter;
                    this._search_need_update[mode] = false;
                    this.in_show_result = true;
                    Common.Dispatcher.trigger('sidebar:show_loading', mode);
                    this.showResult();
                }
            } else {
                if(mode == 'favorites') {
                    this._openFavorites();
                }
            }
        },
        onFinishedSearch: function (is_not_empty, mode, num) {
            Common.Dispatcher.trigger('sidebar:hide_loading', mode);
            if(mode) {
                this._search_results[mode] = num;
            }

            if (Common.Router.selected_occupation) {
                Common.Dispatcher.trigger('occupation-' + Common.Router.selected_occupation + ':routed');
            }
        },
        showResult: function (mode) {
            var that = this;
            if (this.map_in_fullscreen) {
                var $toggle = $('#result-toogle');
                this.parent.openResultContainer($toggle);
            }
        },
        toogleResult: function (event) {
            if ($(event.target).hasClass('fa-caret-left')) {
                this.parent.openResultContainer($(event.target));
            } else {
                this.parent.closeResultContainer($(event.target));
            }
        },
        locationFilterSelected: function (event) {
            $('#location').hide();
            $('#cancel-location').show();

            this.cancelDraw('circle');
            this.cancelDraw('polygon');

            // enable location filter
            this.parent.enableLocationFilter();
        },
        cancelLocationClicked: function () {
            $('#location').show();
            $('#cancel-location').hide();

            // disable location filter
            this.parent.disableLocationFilter();
        },
        drawModeSelected: function (event) {
            if (!$(event.target).hasClass('disabled')) {
                this.cancelDraw('circle');
                this.cancelDraw('polygon');
                this.cancelLocationClicked();

                this.$el.find('.search-bar').find('.m-button').removeClass('active');
                $(event.target).addClass('active');
                var selected = $(event.target).get(0).id;

                var drawer = this._drawer[selected.split('-').pop()];
                drawer.call(this);
                this.clearAllDraw();
            }
        },
        _initializeDrawPolygon: function () {
            $('#draw-polygon').hide();
            $('#cancel-draw-polygon').show();
            // enable polygon drawer
            this.parent.enablePolygonDrawer();
        },
        _initializeDrawCircle: function () {
            $('#draw-circle').hide();
            $('#cancel-draw-circle').show();
            // enable circle drawer
            this.parent.enableCircleDrawer();
        },
        cancelDrawClicked: function (element) {
            var shape = $(element.target).attr('id').split('-').pop();
            this.cancelDraw(shape);
        },
        cancelDraw: function (shape) {
            shape == 'circle' ? this.parent.disableCircleDrawer(): this.parent.disablePolygonDrawer();
            $('#draw-' + shape).show();
            $('#cancel-draw-' + shape).hide();
            this.$el.find('.search-bar').find('.m-button').removeClass('active');
        },
        clearAllDrawWithoutRouting: function () {
            $('#clear-draw').hide();
            // remove all drawn layer in map
            this.parent.clearAllDrawnLayer();
        },
        clearAllDraw: function () {
            this.clearAllDrawWithoutRouting();
            this.updateSearchRoute();
        },
        showClearDrawButton: function () {
            $('#clear-draw').show();
        },
        // Draw Events
        onFinishedCreatedShape: function (shape) {
            this.cancelDraw(shape);
            this.showClearDrawButton();
            this.updateSearchRoute();
        },
        changeCategoryButton: function (mode) {
            // Shows relevant search result container
            this.parent.showResultContainer(mode);

            this.$el.find('.search-category').find('.search-option').removeClass('active');
            var $button = null;
            var highlight = "";
            if (mode == "provider") {
                $button = this.$provider_button;
                highlight = 'Search for provider';
            } else if (mode == "course") {
                $button = this.$course_button;
                highlight = 'Search for courses';
            } else if (mode == "occupation") {
                $button = this.$occupation_button;
                highlight = 'Search for occuption';
            } else if (mode == "favorites") {
                $button = this.$favorites_button;
                highlight = '';
            }

            // change placeholder of input
            this.$search_bar_input.attr("placeholder", highlight);
            this.showSearchBar(0);
            if ($button) {
                $button.addClass('active');
                Common.CurrentSearchMode = mode;
                Common.Dispatcher.trigger('sidebar:change_title', mode);
            }
        },
        mapResize: function (is_resizing) {
            this.map_in_fullscreen = is_resizing;
            if (is_resizing) { // To fullscreen
                this.$('#back-home').show();
                this.$('#result-toogle').show();
                this.parent.closeResultContainer($('#result-toogle'));
            } else { // Exit fullscreen
                this.$('#back-home').hide();
                this.$('#result-toogle').hide();
            }
        },
        showSearchBar: function (speed) {
            if (this.search_bar_hidden) {
                this.$search_bar.slideToggle(speed);
                // zoom control animation
                var $zoom_control = $('.leaflet-control-zoom');
                $zoom_control.animate({
                    marginTop: '+=55px'
                }, speed);
                var $result = $('#result');
                $result.animate({
                    paddingTop: '+=55px'
                }, speed);

                // now it is shown
                this.search_bar_hidden = false;
            }
        },
        hideSearchBar: function (e) {
            if (!this.search_bar_hidden) {
                this.$search_bar.slideToggle(500, function () {
                });
                // zoom control animation
                var $zoom_control = $('.leaflet-control-zoom');
                $zoom_control.animate({
                    marginTop: '-=55px'
                }, 500);

                // now it is shown
                this.search_bar_hidden = true;
            }
        },
        exitOccupation: function () {
            var that = this;
            var $cover = $('#shadow-map');
            if ($cover.is(":visible")) {
                $cover.fadeOut(500);
                $('#result-detail').hide("slide", {direction: "right"}, 500, function () {
                    that.exitResult();
                });
            } else {
                that.exitResult();
            }
        },
        exitResult: function () {
            if ($('#result').is(":visible")) {
                $('#result-toogle').removeClass('fa-caret-right');
                $('#result-toogle').addClass('fa-caret-left');
                $('#result').hide("slide", {direction: "right"}, 500, function () {
                    Common.Dispatcher.trigger('map:exitFullScreen');
                });
            } else {
                Common.Dispatcher.trigger('map:exitFullScreen');
            }
        },
        enableFilterResult: function () {
            $('#draw-polygon').removeClass('disabled');
            $('#draw-circle').removeClass('disabled');
            $('#location').removeClass('disabled');
        },
        disableFilterResult: function () {
            this.cancelDraw('circle');
            this.cancelDraw('polygon');
            this.cancelLocationClicked();
            $('#draw-polygon').addClass('disabled');
            $('#draw-circle').addClass('disabled');
            $('#location').addClass('disabled');
        },
        _addResponsiveTab: function(div) {
            div.addClass('responsive-tabs');

            div.on('click', 'li.active > a, span.glyphicon', function() {
                div.toggleClass('open');
            }.bind(div));

            div.on('click', 'li:not(.active) > a', function() {
                div.removeClass('open');
            }.bind(div));
        }
    });

    return SearchBarView;
});