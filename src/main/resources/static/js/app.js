/* Sales Order UI - AngularJS 1.1.5 */
var app = angular.module('salesApp', []);

/* limitTo has no "begin" argument in 1.1.x, so paging uses this helper filter */
app.filter('startFrom', function () {
    return function (input, start) {
        if (!input) return input;
        return input.slice(+start);
    };
});

app.controller('MainCtrl', ['$scope', '$http', '$filter', '$q', function ($scope, $http, $filter, $q) {

    /* ---------- API config ---------- */
    var API_URL = 'https://hiring.harrisons.my/api/mock/sales-orders';
    var API_KEY = 'hssb-assessment-mock-2026';
    var API_PAGE_SIZE = 100;                      // API returns 25 per page by default; 100 = max
    var API_HEADERS = {'x-assessment-key': API_KEY};
    var MAX_PAGE_SIZE = 100;

    /* the API may return a plain array or wrap it, e.g. {data:[...]} */
    function extractList(res) {
        if (angular.isArray(res)) return res;
        var keys = ['data', 'items', 'content', 'results', 'salesOrders', 'value'];
        for (var i = 0; i < keys.length; i++) {
            var v = res && res[keys[i]];
            if (angular.isArray(v)) return v;
            if (v && typeof v === 'object') { var inner = extractList(v); if (inner.length) return inner; }
        }
        return [];
    }

    /* ---------- map D365 sales order fields to the UI model ---------- */
    function val(o, name) {
        var v = o[name];
        return (v === undefined || v === null) ? '' : v;
    }

    /* D365 SalesStatus enum: 0 None, 1 Backorder, 2 Delivered, 3 Invoiced, 4 Canceled */
    var STATUS_MAP = {
        '1': 'open', 'backorder': 'open', 'open': 'open', 'open order': 'open',
        'pending': 'pending',
        'completed': 'completed', 'complete': 'completed',
        '3': 'invoiced', 'invoiced': 'invoiced',
        '2': 'delivered', 'delivered': 'delivered',
        '4': 'cancel', 'canceled': 'cancel', 'cancelled': 'cancel', 'cancel': 'cancel'
    };
    function normStatus(o) {
        // DOT_ShowOrderStatus is the display status; fall back to SalesStatus
        var raw = String(val(o, 'DOT_ShowOrderStatus') || val(o, 'SalesStatus')).trim();
        var key = raw.toLowerCase();
        return STATUS_MAP[key] || key || 'unknown';
    }

    function mapOrder(o) {
        return {
            salesId:      String(val(o, 'SalesId')),
            custAccount:  String(val(o, 'CustAccount')),
            customer:     String(val(o, 'SalesName')),
            branch:       String(val(o, 'InventSiteId')),
            orderDate:    String(val(o, 'CreatedDateTime1')).substring(0, 10),
            status:       normStatus(o),
            rawStatus:    String(val(o, 'DOT_ShowOrderStatus') || val(o, 'SalesStatus')),
            amount:       parseFloat(val(o, 'HAR_TotalSOAmount')) || 0,
            invoiced:     parseFloat(val(o, 'HAR_InvoicedAmount')) || 0,
            balance:      parseFloat(val(o, 'HAR_BalanceAmount')) || 0,
            orderBy:      String(val(o, 'SalesTaker')),
            customerRef:  String(val(o, 'CustomerRef')),
            poNumber:     String(val(o, 'PurchOrderFormNum'))
        };
    }

    $scope.view = 'dashboard';
    $scope.loading = true;
    $scope.error = null;

    $scope.orders = [];
    $scope.filtered = [];
    $scope.statuses = ['open', 'pending', 'completed', 'invoiced', 'delivered', 'cancel'];
    $scope.branches = [];

    $scope.columns = [
        {key: 'salesId',   label: 'Sales ID'},
        {key: 'customer',  label: 'Customer'},
        {key: 'branch',    label: 'Branch'},
        {key: 'orderDate', label: 'Order Date'},
        {key: 'status',    label: 'Status'},
        {key: 'amount',    label: 'Total', num: true},
        {key: 'balance',   label: 'Balance', num: true},
        {key: 'orderBy',   label: 'Sales Taker'}
    ];

    $scope.search = {status: '', branch: '', q: ''};
    $scope.sort = {key: 'orderDate', reverse: true};
    $scope.pageSizes = [10, 25, 50, 100];
    $scope.paging = {page: 0, size: 25};

    $scope.rangeFrom = function () {
        return $scope.filtered.length ? $scope.paging.page * $scope.paging.size + 1 : 0;
    };
    $scope.rangeTo = function () {
        return Math.min(($scope.paging.page + 1) * $scope.paging.size, $scope.filtered.length);
    };

    /* ---------- menu ---------- */
    $scope.setView = function (v) { $scope.view = v; };

    $scope.openSales = function (criteria) {
        $scope.search = {status: criteria.status || '', branch: criteria.branch || '', q: ''};
        $scope.view = 'sales';
        $scope.resetPage();
    };

    /* ---------- search / sort / paging ---------- */
    function applyFilter() {
        var s = $scope.search,
            q = (s.q || '').toLowerCase();

        var list = $scope.orders.filter(function (o) {
            if (s.status && o.status !== s.status) return false;
            if (s.branch && o.branch !== s.branch) return false;
            if (q &&
                o.salesId.toLowerCase().indexOf(q) < 0 &&
                o.customer.toLowerCase().indexOf(q) < 0 &&
                o.custAccount.toLowerCase().indexOf(q) < 0 &&
                o.customerRef.toLowerCase().indexOf(q) < 0 &&
                o.poNumber.toLowerCase().indexOf(q) < 0 &&
                o.orderBy.toLowerCase().indexOf(q) < 0) return false;
            return true;
        });

        $scope.filtered = $filter('orderBy')(list, $scope.sort.key, $scope.sort.reverse);
        $scope.filteredAmount = sum($scope.filtered);
        if ($scope.paging.page > $scope.pageCount() - 1) {
            $scope.paging.page = Math.max(0, $scope.pageCount() - 1);
        }
    }

    $scope.resetPage = function () {
        if ($scope.paging.size > MAX_PAGE_SIZE) $scope.paging.size = MAX_PAGE_SIZE;
        $scope.paging.page = 0;
        applyFilter();
    };

    $scope.clearSearch = function () {
        $scope.search = {status: '', branch: '', q: ''};
        $scope.resetPage();
    };

    $scope.sortBy = function (key) {
        if ($scope.sort.key === key) {
            $scope.sort.reverse = !$scope.sort.reverse;
        } else {
            $scope.sort.key = key;
            $scope.sort.reverse = false;
        }
        applyFilter();
    };

    $scope.pageCount = function () {
        return Math.max(1, Math.ceil($scope.filtered.length / $scope.paging.size));
    };

    $scope.goTo = function (p) {
        $scope.paging.page = Math.min(Math.max(0, p), $scope.pageCount() - 1);
    };

    /* show at most 7 page buttons around the current page */
    $scope.pageList = function () {
        var total = $scope.pageCount(), cur = $scope.paging.page,
            from = Math.max(0, cur - 3), to = Math.min(total - 1, from + 6), pages = [];
        from = Math.max(0, to - 6);
        for (var i = from; i <= to; i++) pages.push(i);
        return pages;
    };

    /* ---------- dashboard ---------- */
    function sum(list) {
        var t = 0;
        for (var i = 0; i < list.length; i++) t += list[i].amount;
        return t;
    }

    function buildSummary(response) {
        // add any status from the API that is not in the default list
        angular.forEach(response, function (x) {
            if ($scope.statuses.indexOf(x.status) < 0) $scope.statuses.push(x.status);
        });

        // ---- by status ----
        var byStatus = [];
        var grandTotal = 0;
        angular.forEach($scope.statuses, function (st) {
            var item = { status: st, count: 0, totalAmount: 0 };
            angular.forEach(response, function (x) {
                if (x.status === st) {
                    item.count++;
                    item.totalAmount += x.amount;
                }
            });
            grandTotal += item.totalAmount;
            byStatus.push(item);
        });

        // ---- by branch (InventSiteId) ----
        var branchNames = [];
        angular.forEach(response, function (x) {
            if (branchNames.indexOf(x.branch) < 0) branchNames.push(x.branch);
        });
        branchNames.sort();
        $scope.branches = branchNames;

        var byBranch = [];
        angular.forEach(branchNames, function (br) {
            var item = { branch: br, count: 0, totalAmount: 0 };
            angular.forEach(response, function (x) {
                if (x.branch === br) {
                    item.count++;
                    item.totalAmount += x.amount;
                }
            });
            byBranch.push(item);
        });

        // ---- largest values, used to scale the bars ----
        var maxCount = 0, maxBranchAmount = 0;
        angular.forEach(byStatus, function (i) { if (i.count > maxCount) maxCount = i.count; });
        angular.forEach(byBranch, function (i) { if (i.totalAmount > maxBranchAmount) maxBranchAmount = i.totalAmount; });

        $scope.summary = {
            totalOrders: response.length,
            totalOrderValue: grandTotal,
            totalAmount: grandTotal,
            byStatus: byStatus,
            byBranch: byBranch,
            maxCount: maxCount,
            maxBranchAmount: maxBranchAmount
        };
    }

    /* count of one status, e.g. countOf('open') */
    $scope.countOf = function (st) {
        if (!$scope.summary) return 0;
        for (var i = 0; i < $scope.summary.byStatus.length; i++) {
            if ($scope.summary.byStatus[i].status === st) return $scope.summary.byStatus[i].count;
        }
        return 0;
    };

    $scope.pct = function (v, max) {
        return max ? Math.round((v || 0) / max * 100) : 0;
    };

    /* ---------- load ----------
       The API is paged (default 25 rows). Fetch page 1 to learn totalPages,
       then fetch the remaining pages in parallel and combine them. */
    function fetchPage(page) {
        return $http.get(API_URL, {
            headers: API_HEADERS,
            params: {page: page, pageSize: API_PAGE_SIZE, sort: 'SalesId', order: 'asc'}
        });
    }

    function done(list, summary) {
        $scope.orders = list.map(mapOrder);
        $scope.apiSummary = summary || null;   // totals returned by the API, if needed
        buildSummary($scope.orders);
        applyFilter();
        $scope.loading = false;
    }

    function fail(res) {
        var status = res && res.status;
        $scope.error = status === 0
            ? 'Could not reach the API (network or CORS blocked). Check the browser console.'
            : 'Failed to load sales orders (HTTP ' + status + ').';
        $scope.loading = false;
    }

    fetchPage(1).then(function (res) {
        var first = res.data,
            all = extractList(first),
            totalPages = first.totalPages || 1;

        if (totalPages <= 1) { done(all, first.summary); return; }

        var calls = [];
        for (var p = 2; p <= totalPages; p++) calls.push(fetchPage(p));

        $q.all(calls).then(function (results) {
            angular.forEach(results, function (r) { all = all.concat(extractList(r.data)); });
            done(all, first.summary);
        }, fail);
    }, fail);
}]);
