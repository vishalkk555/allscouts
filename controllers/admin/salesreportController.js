const Order = require('../../models/orderSchema');
const Category = require("../../models/categorySchema")
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Coupon = require('../../models/couponSchema');

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Render Dashboard Page
const getDashboard = async (req, res) => {
    try {
        res.render('dashboard');
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.status(500).send('Server Error');
    }
};

// Get Dashboard Data API
const getDashboardData = async (req, res) => {
    try {
        const { filter = 'daily', startDate, endDate } = req.query;
        let dateRanges;

        if (filter === 'custom' && startDate && endDate) {
            dateRanges = {
                current: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                },
                previous: {
                    start: new Date(startDate),
                    end: new Date(endDate)
                }
            };
            dateRanges.current.end.setHours(23, 59, 59, 999);
            
            // Calculate previous period for comparison
            const daysDiff = Math.ceil((dateRanges.current.end - dateRanges.current.start) / (1000 * 60 * 60 * 24));
            dateRanges.previous.start = new Date(dateRanges.current.start);
            dateRanges.previous.start.setDate(dateRanges.previous.start.getDate() - daysDiff - 1);
            dateRanges.previous.end = new Date(dateRanges.current.start);
            dateRanges.previous.end.setDate(dateRanges.previous.end.getDate() - 1);
        } else {
            dateRanges = getDateRange(filter);
        }

        // Get stats for current period
        const currentStats = await calculateStats(dateRanges.current);
        
        // Get stats for previous period (for comparison)
        const previousStats = await calculateStats(dateRanges.previous);

        // Calculate percentage changes
        const revenueChange = calculatePercentageChange(
            previousStats.totalRevenue,
            currentStats.totalRevenue
        );
        const ordersChange = calculatePercentageChange(
            previousStats.totalOrders,
            currentStats.totalOrders
        );

        // Get chart data
        const chartData = await getChartData(filter, dateRanges.current, startDate, endDate);

        // Get top 10 best selling products
        const topProducts = await getTopProducts(dateRanges.current);

        // Get top 10 best selling categories
        const topCategories = await getTopCategories(dateRanges.current);

        res.json({
            success: true,
            stats: {
                ...currentStats,
                revenueChange: Math.round(revenueChange * 100) / 100,
                ordersChange: Math.round(ordersChange * 100) / 100
            },
            chartData,
            topProducts,
            topCategories
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Calculate Statistics
const calculateStats = async (dateRange) => {
    try {
        // Get orders within date range
        const orders = await Order.find({
            createdAt: { $gte: dateRange.start, $lte: dateRange.end },
            orderStatus: { $nin: ['Cancelled'] }
        });

        // Calculate total revenue (excluding cancelled orders)
        const totalRevenue = orders.reduce((sum, order) => sum + order.orderAmount, 0);

        // Calculate total discounts
        const totalDiscounts = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);

        // Total orders count
        const totalOrders = orders.length;

        // Get active products (not blocked and in stock)
        const activeProducts = await Product.countDocuments({
            isBlocked: false,
            status: { $in: ['Available', 'out of stock'] }
        });

        return {
            totalRevenue,
            totalOrders,
            totalDiscounts,
            activeProducts
        };
    } catch (error) {
        console.error('Error calculating stats:', error);
        throw error;
    }
};

// Get Top 10 Best Selling Products
const getTopProducts = async (dateRange) => {
    try {
        const orders = await Order.find({
            createdAt: { $gte: dateRange.start, $lte: dateRange.end },
            orderStatus: { $nin: ['Cancelled', 'Returned'] }
        }).populate({
            path: 'orderedItem.productId',
            match: {
                isBlocked: false,
                status: { $in: ['Available', 'out of stock'] }
            }
        });

        const productStats = {};

        orders.forEach(order => {
            order.orderedItem.forEach(item => {
                if (item.productId && item.productStatus !== 'Cancelled' && item.productStatus !== 'Returned') {
                    const productId = item.productId._id.toString();
                    if (!productStats[productId]) {
                        productStats[productId] = {
                            name: item.productId.productName,
                            unitsSold: 0,
                            revenue: 0
                        };
                    }
                    productStats[productId].unitsSold += item.quantity;
                    productStats[productId].revenue += item.totalProductPrice;
                }
            });
        });

        const topProducts = Object.values(productStats)
            .sort((a, b) => b.unitsSold - a.unitsSold)
            .slice(0, 10);

        return topProducts;
    } catch (error) {
        console.error('Error getting top products:', error);
        return [];
    }
};

// Get Top 10 Best Selling Categories
const getTopCategories = async (dateRange) => {
    try {
        const orders = await Order.find({
            createdAt: { $gte: dateRange.start, $lte: dateRange.end },
            orderStatus: { $nin: ['Cancelled', 'Returned'] }
        }).populate({
            path: 'orderedItem.productId',
            match: {
                isBlocked: false,
                status: { $in: ['Available', 'out of stock'] }
            },
            populate: { 
                path: 'category', 
                model: 'Category',
                match: { isActive: true }
            }
        });

        const categoryStats = {};

        orders.forEach(order => {
            order.orderedItem.forEach(item => {
                if (item.productId && item.productId.category && item.productStatus !== 'Cancelled' && item.productStatus !== 'Returned') {
                    const categoryId = item.productId.category._id.toString();
                    if (!categoryStats[categoryId]) {
                        categoryStats[categoryId] = {
                            name: item.productId.category.name,
                            unitsSold: 0,
                            revenue: 0
                        };
                    }
                    categoryStats[categoryId].unitsSold += item.quantity;
                    categoryStats[categoryId].revenue += item.totalProductPrice;
                }
            });
        });

        const topCategories = Object.values(categoryStats)
            .sort((a, b) => b.unitsSold - a.unitsSold)
            .slice(0, 10);

        return topCategories;
    } catch (error) {
        console.error('Error getting top categories:', error);
        return [];
    }
};

// Get Date Range based on filter
function getDateRange(filter) {
    const now = new Date();
    let currentStart, currentEnd, previousStart, previousEnd;

    switch (filter) {
        case 'daily':
            currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 1);
            previousEnd = new Date(currentEnd);
            previousEnd.setDate(previousEnd.getDate() - 1);
            break;

        case 'weekly':
            currentStart = new Date(now);
            currentStart.setDate(now.getDate() - 6);
            currentStart.setHours(0, 0, 0, 0);
            currentEnd = new Date(now);
            currentEnd.setHours(23, 59, 59, 999);
            previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 7);
            previousEnd = new Date(currentEnd);
            previousEnd.setDate(previousEnd.getDate() - 7);
            break;

        case 'monthly':
            currentStart = new Date(now);
            currentStart.setDate(now.getDate() - 29);
            currentStart.setHours(0, 0, 0, 0);
            currentEnd = new Date(now);
            currentEnd.setHours(23, 59, 59, 999);
            previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 30);
            previousEnd = new Date(currentEnd);
            previousEnd.setDate(previousEnd.getDate() - 30);
            break;

        case 'yearly':
            currentStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
            currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            previousStart = new Date(currentStart);
            previousStart.setFullYear(previousStart.getFullYear() - 1);
            previousEnd = new Date(currentEnd);
            previousEnd.setFullYear(previousEnd.getFullYear() - 1);
            break;

        default:
            currentStart = new Date(now);
            currentStart.setDate(now.getDate() - 6);
            currentEnd = new Date(now);
            previousStart = new Date(currentStart);
            previousStart.setDate(previousStart.getDate() - 7);
            previousEnd = new Date(currentEnd);
            previousEnd.setDate(previousEnd.getDate() - 7);
    }

    return {
        current: { start: currentStart, end: currentEnd },
        previous: { start: previousStart, end: previousEnd }
    };
}

// Calculate Percentage Change
function calculatePercentageChange(oldValue, newValue) {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
}

// Get Chart Data
const getChartData = async (filter, dateRange, startDate, endDate) => {
    try {
        let groupBy, labels, data;

        if (filter === 'custom' && startDate && endDate) {
            // For custom date range, determine grouping based on date span
            const start = new Date(startDate);
            const end = new Date(endDate);
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

            if (daysDiff <= 1) {
                // Group by hour for same day
                filter = 'daily';
            } else if (daysDiff <= 31) {
                // Group by day for up to a month
                filter = 'weekly';
            } else if (daysDiff <= 365) {
                // Group by week for up to a year
                filter = 'monthly';
            } else {
                // Group by month for more than a year
                filter = 'yearly';
            }
        }

        switch (filter) {
            case 'daily':
                // Group by hour
                groupBy = { $hour: '$createdAt' };
                const hourlyOrders = await Order.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                        }
                    },
                    {
                        $group: {
                            _id: groupBy,
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);

                labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
                data = Array(24).fill(0);
                hourlyOrders.forEach(item => {
                    data[item._id] = item.count;
                });
                break;

            case 'weekly':
                // Group by day of week
                const weeklyOrders = await Order.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);

                labels = [];
                data = [];
                const daysToShow = Math.min(30, Math.ceil((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24)));
                for (let i = daysToShow - 1; i >= 0; i--) {
                    const date = new Date(dateRange.end);
                    date.setDate(date.getDate() - i);
                    const dateStr = date.toISOString().split('T')[0];
                    labels.push(date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
                    const order = weeklyOrders.find(o => o._id === dateStr);
                    data.push(order ? order.count : 0);
                }
                break;

            case 'monthly':
                // Group by day
                const monthlyOrders = await Order.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                        }
                    },
                    {
                        $group: {
                            _id: {
                                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);

                labels = [];
                data = [];
                for (let i = 29; i >= 0; i--) {
                    const date = new Date(dateRange.end);
                    date.setDate(date.getDate() - i);
                    const dateStr = date.toISOString().split('T')[0];
                    labels.push(date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
                    const order = monthlyOrders.find(o => o._id === dateStr);
                    data.push(order ? order.count : 0);
                }
                break;

            case 'yearly':
                // Group by month
                const yearlyOrders = await Order.aggregate([
                    {
                        $match: {
                            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
                        }
                    },
                    {
                        $group: {
                            _id: { $month: '$createdAt' },
                            count: { $sum: 1 }
                        }
                    },
                    { $sort: { _id: 1 } }
                ]);

                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                labels = monthNames;
                data = Array(12).fill(0);
                yearlyOrders.forEach(item => {
                    data[item._id - 1] = item.count;
                });
                break;

            default:
                labels = [];
                data = [];
        }

        return { labels, data };
    } catch (error) {
        console.error('Error getting chart data:', error);
        throw error;
    }
};

// Generate Sales Report
const generateSalesReport = async (req, res) => {
    try {
        const { type, format, startDate, endDate } = req.query;

        let dateRange;
        if (type === 'custom') {
            dateRange = {
                start: new Date(startDate),
                end: new Date(endDate)
            };
            dateRange.end.setHours(23, 59, 59, 999);
        } else {
            dateRange = getDateRange(type).current;
        }

        // Fetch orders within date range
        const orders = await Order.find({
            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
        })
            .populate('userId', 'name email')
            .populate('orderedItem.productId', 'productName')
            .sort({ createdAt: -1 })
            .lean();

        // Calculate totals
        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, order) => {
            if (order.orderStatus !== 'Cancelled') {
                return sum + order.orderAmount;
            }
            return sum;
        }, 0);
        const totalDiscount = orders.reduce((sum, order) => sum + (order.couponDiscount || 0), 0);
        const netRevenue = totalRevenue - totalDiscount;

        if (format === 'pdf') {
            generatePDFReport(res, orders, { totalOrders, totalRevenue, totalDiscount, netRevenue }, dateRange);
        } else if (format === 'excel') {
            await generateExcelReport(res, orders, { totalOrders, totalRevenue, totalDiscount, netRevenue }, dateRange);
        } else if (format === 'csv') {
            generateCSVReport(res, orders, { totalOrders, totalRevenue, totalDiscount, netRevenue }, dateRange);
        } else {
            res.status(400).json({ success: false, message: 'Invalid format' });
        }
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Generate PDF Report
function generatePDFReport(res, orders, totals, dateRange) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Sales Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Period: ${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Summary');
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`Total Orders: ${totals.totalOrders}`);
    doc.text(`Total Revenue: ₹${totals.totalRevenue.toFixed(2)}`);
    doc.text(`Total Discounts: ₹${totals.totalDiscount.toFixed(2)}`);
    doc.text(`Net Revenue: ₹${totals.netRevenue.toFixed(2)}`);
    doc.moveDown(2);

    // Orders Table
    doc.fontSize(14).font('Helvetica-Bold').text('Order Details');
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const itemHeight = 25;

    // Table headers
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Order ID', 50, tableTop);
    doc.text('Date', 130, tableTop);
    doc.text('Customer', 210, tableTop);
    doc.text('Amount', 320, tableTop);
    doc.text('Discount', 400, tableTop);
    doc.text('Status', 480, tableTop);

    // Table rows
    doc.font('Helvetica').fontSize(9);
    orders.slice(0, 20).forEach((order, i) => {
        const y = tableTop + (i + 1) * itemHeight;
        
        if (y > 700) {
            doc.addPage();
            return;
        }

        doc.text(order.orderNumber || order._id.toString().substring(0, 8), 50, y, { width: 70, ellipsis: true });
        doc.text(new Date(order.createdAt).toLocaleDateString(), 130, y);
        doc.text(order.userId?.name || 'Guest', 210, y, { width: 100, ellipsis: true });
        doc.text(`₹${order.orderAmount.toFixed(2)}`, 320, y);
        doc.text(`₹${(order.couponDiscount || 0).toFixed(2)}`, 400, y);
        doc.text(order.orderStatus, 480, y);
    });

    doc.end();
}

// Generate Excel Report
async function generateExcelReport(res, orders, totals, dateRange) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Set column widths
    worksheet.columns = [
        { header: 'Order ID', key: 'orderId', width: 20 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Customer', key: 'customer', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Order Amount', key: 'amount', width: 15 },
        { header: 'Coupon Discount', key: 'discount', width: 15 },
        { header: 'Net Amount', key: 'netAmount', width: 15 },
        { header: 'Payment Method', key: 'paymentMethod', width: 15 },
        { header: 'Status', key: 'status', width: 15 }
    ];

    // Add summary rows
    worksheet.addRow([]);
    worksheet.addRow(['Sales Report']);
    worksheet.addRow([`Period: ${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`]);
    worksheet.addRow([]);
    worksheet.addRow(['Summary']);
    worksheet.addRow(['Total Orders', totals.totalOrders]);
    worksheet.addRow(['Total Revenue', `₹${totals.totalRevenue.toFixed(2)}`]);
    worksheet.addRow(['Total Discounts', `₹${totals.totalDiscount.toFixed(2)}`]);
    worksheet.addRow(['Net Revenue', `₹${totals.netRevenue.toFixed(2)}`]);
    worksheet.addRow([]);

    // Add header row
    const headerRow = worksheet.addRow([
        'Order ID', 'Date', 'Customer', 'Email', 'Order Amount', 'Coupon Discount', 'Net Amount', 'Payment Method', 'Status'
    ]);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD3D3D3' }
    };

    // Add data rows
    orders.forEach(order => {
        worksheet.addRow({
            orderId: order.orderNumber || order._id.toString().substring(0, 8),
            date: new Date(order.createdAt).toLocaleDateString(),
            customer: order.userId?.name || 'Guest',
            email: order.userId?.email || 'N/A',
            amount: order.orderAmount,
            discount: order.couponDiscount || 0,
            netAmount: order.orderAmount - (order.couponDiscount || 0),
            paymentMethod: order.paymentMethod,
            status: order.orderStatus
        });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
}

// Generate CSV Report
function generateCSVReport(res, orders, totals, dateRange) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.csv');

    let csv = 'Sales Report\n';
    csv += `Period: ${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}\n\n`;
    csv += 'Summary\n';
    csv += `Total Orders,${totals.totalOrders}\n`;
    csv += `Total Revenue,₹${totals.totalRevenue.toFixed(2)}\n`;
    csv += `Total Discounts,₹${totals.totalDiscount.toFixed(2)}\n`;
    csv += `Net Revenue,₹${totals.netRevenue.toFixed(2)}\n\n`;

    csv += 'Order ID,Date,Customer,Email,Order Amount,Coupon Discount,Net Amount,Payment Method,Status\n';

    orders.forEach(order => {
        csv += `${order.orderNumber || order._id.toString().substring(0, 8)},`;
        csv += `${new Date(order.createdAt).toLocaleDateString()},`;
        csv += `${order.userId?.name || 'Guest'},`;
        csv += `${order.userId?.email || 'N/A'},`;
        csv += `₹${order.orderAmount.toFixed(2)},`;
        csv += `₹${(order.couponDiscount || 0).toFixed(2)},`;
        csv += `₹${(order.orderAmount - (order.couponDiscount || 0)).toFixed(2)},`;
        csv += `${order.paymentMethod},`;
        csv += `${order.orderStatus}\n`;
    });

    res.send(csv);
}

module.exports = {
    getDashboard,
    getDashboardData,
    generateSalesReport
};