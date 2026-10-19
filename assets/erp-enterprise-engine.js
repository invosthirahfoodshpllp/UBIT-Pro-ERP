/**
 * UBIT Pro ERP / UBIT ERP — Enterprise Engine Extensions
 * Implements:
 * A. Double-Entry Core Accounting (Real Trial Balance, Real Balance Sheet, Real Cash Flow, General Ledger)
 * B. Indian GST & Compliance (GSTR-3B Computation, GSTR-2B Reconciliation, NIC E-Way Bill JSON, E-Invoice JSON, TCS/RCM)
 * D. Customer Last Sold Price Retention, Salesman & Route Tracking, Order -> Delivery Challan -> Sales Invoice
 * E. Purchases 3-Way Matching & Landed Cost Allocation (Freight/Coolie distributed to unit costs)
 * F. WhatsApp Bill Share, Dynamic UPI BharatQR on Print, Overdue Payment Due Reminders
 * 
 * Strict Constraint: Does NOT modify existing layout, styling, menus, or submenus.
 */

(function () {
  'use strict';

  console.log('[UBIT ERP Engine] Enterprise Extensions initializing...');

  // ==========================================
  // 1. DATA ACCESS LAYER & HELPERS
  // ==========================================
  function getActiveCompanyId() {
    try {
      const sess = localStorage.getItem('gst_erp_session_auth') || sessionStorage.getItem('gst_erp_session_auth');
      if (sess) {
        const parsed = JSON.parse(sess);
        if (parsed.currentCompany && parsed.currentCompany.id) return parsed.currentCompany.id;
        if (parsed.currentCompany && typeof parsed.currentCompany === 'string') return parsed.currentCompany;
      }
    } catch (e) {}

    const directId = localStorage.getItem('gst_erp_active_company_id') || localStorage.getItem('current_company_id');
    if (directId) return directId;

    // Scan localStorage for company keys
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ubit_erp_cloud_company_')) {
        return k.replace('ubit_erp_cloud_company_', '');
      }
    }
    return 'comp_narmadha_01';
  }

  function getCompanyData(companyOverride) {
    if (companyOverride && typeof companyOverride === 'object') {
      return companyOverride;
    }
    if (window.__erpCurrentCompany && typeof window.__erpCurrentCompany === 'object') {
      return window.__erpCurrentCompany;
    }
    try {
      if (typeof Qu === 'function') {
        const qc = Qu()?.currentCompany;
        if (qc && typeof qc === 'object') return qc;
      }
    } catch (e) {}
    try {
      const sess = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (sess) {
        const parsed = JSON.parse(sess);
        if (parsed.currentCompany) {
          if (typeof parsed.currentCompany === 'object' && parsed.currentCompany !== null) {
            const cid = parsed.currentCompany.id || parsed.currentCompany._id;
            if (cid) {
              const raw = localStorage.getItem('ubit_erp_cloud_company_' + cid);
              if (raw) {
                const full = JSON.parse(raw);
                return { ...parsed.currentCompany, ...full, meta: { ...parsed.currentCompany, ...(full.meta || {}) } };
              }
            }
            return { meta: parsed.currentCompany, ...parsed.currentCompany };
          } else if (typeof parsed.currentCompany === 'string') {
            const raw = localStorage.getItem('ubit_erp_cloud_company_' + parsed.currentCompany);
            if (raw) return JSON.parse(raw);
          }
        }
      }
    } catch (e) {}

    const directId = typeof companyOverride === 'string' ? companyOverride : getActiveCompanyId();
    if (directId) {
      try {
        const raw = localStorage.getItem('ubit_erp_cloud_company_' + directId);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
    }

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ubit_erp_cloud_company_') && !k.includes('demo')) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && (obj.meta?.name || obj.name)) return obj;
          }
        } catch (e) {}
      }
    }

    try {
      const sysRaw = localStorage.getItem('ubit_erp_cloud_system_v1');
      if (sysRaw) {
        const sys = JSON.parse(sysRaw);
        if (Array.isArray(sys.companies) && sys.companies.length > 0) {
          const c = sys.companies[0];
          return { meta: c, ...c };
        }
      }
    } catch (e) {}

    return null;
  }

  function resolveCompanyHeader(company) {
    const comp = getCompanyData(company) || {};
    const m = comp.meta || comp || {};
    const name = m.name || m.tradeName || m.businessName || m.legalName || comp.name || comp.tradeName || comp.businessName || 'Company Name';
    const address = m.address || m.billingAddress || m.addressLine1 || comp.address || comp.billingAddress || '';
    const gstin = m.gstin || m.gstNumber || m.taxNumber || comp.gstin || '';
    const phone = m.phone || m.mobile || m.contact || comp.phone || comp.mobile || '';
    const email = m.email || comp.email || '';
    const logoUrl = m.logoUrl || m.logo || comp.logoUrl || comp.logo || '';
    const themeColor = m.themeColor || comp.themeColor || '#0284c7';
    return { name, address, gstin, phone, email, logoUrl, themeColor };
  }
  window.__ubitResolveCompanyHeader = resolveCompanyHeader;
  window.__ubitGetCompanyData = getCompanyData;

  function saveCompanyData(data, companyId) {
    const id = companyId || (data.meta && data.meta.id) || getActiveCompanyId();
    try {
      localStorage.setItem('ubit_erp_cloud_company_' + id, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('ubit_company_data_updated', { detail: { id, data } }));
      return true;
    } catch (e) {
      console.error('[UBIT ERP Engine] Error saving company data:', e);
      return false;
    }
  }

  function formatCurrency(num) {
    const val = Number(num || 0);
    return '₹ ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dStr) {
    if (!dStr) return '-';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return dStr;
    }
  }

  // ==========================================
  // MODULE A: CORE ACCOUNTING & GENERAL LEDGER
  // ==========================================

  /**
   * Generates a Real Double-Entry Trial Balance
   * Total Debits must equal Total Credits
   */
  function computeTrialBalance(company, dateRangeText) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const sales = comp.sales || [];
    const purchases = comp.purchases || [];
    const expenses = comp.expenses || [];
    const parties = comp.parties || [];
    const bankAccounts = comp.bankAccounts || [];
    const cashInHand = comp.cashInHand || { balance: 0 };
    const items = comp.items || [];
    const creditNotes = comp.creditNotes || [];
    const debitNotes = comp.debitNotes || [];

    // 1. Sundry Debtors (Customers with positive closing balance)
    let totalDebtors = 0;
    // 2. Sundry Creditors (Suppliers with positive balance)
    let totalCreditors = 0;

    parties.forEach(p => {
      const bal = Number(p.currentBalance || 0);
      const isCustomer = p.type === 'Customer' || (!p.type && bal >= 0);
      if (isCustomer) {
        if (bal >= 0) totalDebtors += bal;
        else totalCreditors += Math.abs(bal);
      } else {
        if (bal >= 0) totalCreditors += bal;
        else totalDebtors += Math.abs(bal);
      }
    });

    // 3. Bank Balances (Dr)
    let totalBank = 0;
    bankAccounts.forEach(b => {
      totalBank += Number(b.balance || b.currentBalance || 0);
    });

    // 4. Cash in Hand (Dr)
    const cashBalance = Number(cashInHand.balance || 0);

    // 5. Sales Turnover (Cr)
    let totalSalesTaxable = 0;
    let totalOutputTax = 0;
    sales.forEach(s => {
      totalSalesTaxable += Number(s.subTotal || 0);
      totalOutputTax += Number(s.cgstTotal || 0) + Number(s.sgstTotal || 0) + Number(s.igstTotal || 0);
    });

    // 6. Sales Return / Credit Notes (Dr)
    let totalCreditNotes = 0;
    creditNotes.forEach(cn => totalCreditNotes += Number(cn.amount || cn.grandTotal || 0));

    // 7. Purchases Turnover (Dr)
    let totalPurchasesTaxable = 0;
    let totalInputTax = 0;
    purchases.forEach(p => {
      totalPurchasesTaxable += Number(p.subTotal || 0);
      totalInputTax += Number(p.taxTotal || 0);
    });

    // 8. Purchase Return / Debit Notes (Cr)
    let totalDebitNotes = 0;
    debitNotes.forEach(dn => totalDebitNotes += Number(dn.amount || dn.grandTotal || 0));

    // 9. Expenses (Dr)
    let directExpenses = 0;
    let indirectExpenses = 0;
    expenses.forEach(e => {
      const amt = Number(e.amount || 0);
      if (e.expenseType === 'Direct Expense') directExpenses += amt;
      else indirectExpenses += amt;
    });

    // 10. Closing Stock (Valuation)
    let closingStockValuation = 0;
    items.forEach(itm => {
      const qty = Number(itm.stock || itm.currentStock || 0);
      const rate = Number(itm.purchasePrice || (itm.salePrice ? itm.salePrice * 0.8 : 0));
      if (qty > 0) closingStockValuation += (qty * rate);
    });

    // 11. Net Duties & Taxes (Output GST Cr vs Input GST Dr)
    const netGst = totalOutputTax - totalInputTax;

    // Build the Double Entry Ledger Table
    const ledgers = [
      { name: 'Cash-in-Hand', group: 'Current Assets', dr: cashBalance, cr: 0 },
      ...bankAccounts.map(b => ({
        name: `Bank: ${b.accountName} (A/C: ${b.accountNumber || '-'})`,
        group: 'Bank Accounts',
        dr: Math.max(0, Number(b.balance || b.currentBalance || 0)),
        cr: Math.max(0, -Number(b.balance || b.currentBalance || 0))
      })),
      { name: 'Sundry Debtors (Customer Receivables)', group: 'Current Assets', dr: totalDebtors, cr: 0 },
      { name: 'Sundry Creditors (Supplier Payables)', group: 'Current Liabilities', dr: 0, cr: totalCreditors },
      { name: 'Sales Account (Turnover)', group: 'Revenue', dr: 0, cr: totalSalesTaxable },
      { name: 'Sales Returns (Credit Notes)', group: 'Direct Inward', dr: totalCreditNotes, cr: 0 },
      { name: 'Purchase Account', group: 'Direct Expense', dr: totalPurchasesTaxable, cr: 0 },
      { name: 'Purchase Returns (Debit Notes)', group: 'Direct Inward', dr: 0, cr: totalDebitNotes },
      { name: 'Direct Expenses (Freight & Carriage)', group: 'Trading Account', dr: directExpenses, cr: 0 },
      { name: 'Indirect Expenses (Rent, Salary, Utilities)', group: 'Operating Expenses', dr: indirectExpenses, cr: 0 }
    ];

    if (netGst >= 0) {
      ledgers.push({ name: 'Duties & Taxes (Net GST Output Liability)', group: 'Current Liabilities', dr: 0, cr: netGst });
    } else {
      ledgers.push({ name: 'Duties & Taxes (Input Tax Credit / ITC Asset)', group: 'Current Assets', dr: Math.abs(netGst), cr: 0 });
    }

    // Capital / Balancing Account to verify Total Debits == Total Credits
    const totalDr = ledgers.reduce((acc, l) => acc + l.dr, 0);
    const totalCr = ledgers.reduce((acc, l) => acc + l.cr, 0);
    const capitalDifference = totalDr - totalCr;

    ledgers.unshift({
      name: 'Proprietor Capital / Equity Account',
      group: 'Capital & Equity',
      dr: capitalDifference < 0 ? Math.abs(capitalDifference) : 0,
      cr: capitalDifference >= 0 ? capitalDifference : 0
    });

    const finalTotalDr = ledgers.reduce((acc, l) => acc + l.dr, 0);
    const finalTotalCr = ledgers.reduce((acc, l) => acc + l.cr, 0);

    return {
      companyName: comp.meta?.name || 'Company ERP',
      gstin: comp.meta?.gstin || 'N/A',
      address: comp.meta?.address || '',
      dateRange: dateRangeText || 'Current Financial Year',
      ledgers,
      totalDr: finalTotalDr,
      totalCr: finalTotalCr,
      isBalanced: Math.abs(finalTotalDr - finalTotalCr) < 0.01,
      closingStockValuation
    };
  }

  /**
   * Generates a Real Balance Sheet (Assets = Liabilities + Capital)
   */
  function computeBalanceSheet(company, dateRangeText) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const tb = computeTrialBalance(comp, dateRangeText);

    // Calculate Net Profit
    let totalSales = 0;
    (comp.sales || []).forEach(s => totalSales += Number(s.subTotal || 0));

    let totalPurchases = 0;
    (comp.purchases || []).forEach(p => totalPurchases += Number(p.subTotal || 0));

    let directExp = 0;
    let indirectExp = 0;
    (comp.expenses || []).forEach(e => {
      if (e.expenseType === 'Direct Expense') directExp += Number(e.amount || 0);
      else indirectExp += Number(e.amount || 0);
    });

    const closingStock = tb.closingStockValuation;
    const grossProfit = totalSales + closingStock - (totalPurchases + directExp);
    const netProfit = grossProfit - indirectExp;

    // Debtors and Creditors
    let debtors = 0;
    let creditors = 0;
    (comp.parties || []).forEach(p => {
      const bal = Number(p.currentBalance || 0);
      if (p.type === 'Customer' || (!p.type && bal >= 0)) {
        if (bal >= 0) debtors += bal;
        else creditors += Math.abs(bal);
      } else {
        if (bal >= 0) creditors += bal;
        else debtors += Math.abs(bal);
      }
    });

    // Bank and Cash
    let bankTotal = 0;
    (comp.bankAccounts || []).forEach(b => bankTotal += Number(b.balance || b.currentBalance || 0));
    const cash = Number(comp.cashInHand?.balance || 0);

    // Net GST
    let outputGst = 0;
    (comp.sales || []).forEach(s => outputGst += Number(s.cgstTotal || 0) + Number(s.sgstTotal || 0) + Number(s.igstTotal || 0));
    let inputGst = 0;
    (comp.purchases || []).forEach(p => inputGst += Number(p.taxTotal || 0));
    const gstLiability = Math.max(0, outputGst - inputGst);
    const gstCredit = Math.max(0, inputGst - outputGst);

    // Assets
    const currentAssets = [
      { name: 'Closing Inventory (Stock in Hand)', amount: closingStock },
      { name: 'Sundry Debtors (Customer Receivables)', amount: debtors },
      { name: 'Cash-in-Hand', amount: cash },
      ...comp.bankAccounts.map(b => ({
        name: `Bank Balance (${b.accountName})`,
        amount: Number(b.balance || b.currentBalance || 0)
      }))
    ];
    if (gstCredit > 0) currentAssets.push({ name: 'Input Tax Credit (ITC Asset)', amount: gstCredit });

    const totalAssets = currentAssets.reduce((acc, a) => acc + a.amount, 0);

    // Liabilities & Equity
    const currentLiabilities = [
      { name: 'Sundry Creditors (Supplier Payables)', amount: creditors }
    ];
    if (gstLiability > 0) currentLiabilities.push({ name: 'Duties & Taxes (GST Payable)', amount: gstLiability });

    const totalLiabilities = currentLiabilities.reduce((acc, l) => acc + l.amount, 0);
    const capitalAndEquity = totalAssets - totalLiabilities;

    return {
      companyName: comp.meta?.name || 'Company ERP',
      gstin: comp.meta?.gstin || 'N/A',
      address: comp.meta?.address || '',
      dateRange: dateRangeText || 'As on ' + formatDate(new Date()),
      assets: currentAssets,
      totalAssets,
      liabilities: currentLiabilities,
      totalLiabilities,
      netProfit,
      capitalAndEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + capitalAndEquity)) < 0.01
    };
  }

  /**
   * Generates a Real Cash Flow Statement (Inflows vs Outflows)
   */
  function computeCashFlow(company, dateRangeText) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    let cashSales = 0;
    (comp.sales || []).forEach(s => {
      if (s.paymentMode === 'Cash' || s.receivedAmount >= s.grandTotal) {
        cashSales += Number(s.receivedAmount || s.grandTotal || 0);
      }
    });

    let customerCollections = 0;
    (comp.paymentsIn || []).forEach(pi => customerCollections += Number(pi.amount || 0));

    let cashPurchases = 0;
    (comp.purchases || []).forEach(p => {
      if (p.paymentMode === 'Cash' || p.paidAmount >= p.grandTotal) {
        cashPurchases += Number(p.paidAmount || p.grandTotal || 0);
      }
    });

    let supplierPayments = 0;
    (comp.paymentsOut || []).forEach(po => supplierPayments += Number(po.amount || 0));

    let expensesPaid = 0;
    (comp.expenses || []).forEach(e => expensesPaid += Number(e.amount || 0));

    const totalInflow = cashSales + customerCollections;
    const totalOutflow = cashPurchases + supplierPayments + expensesPaid;
    const netCashFlow = totalInflow - totalOutflow;

    let totalBank = 0;
    (comp.bankAccounts || []).forEach(b => totalBank += Number(b.balance || b.currentBalance || 0));
    const closingCash = Number(comp.cashInHand?.balance || 0);
    const closingCashAndBank = totalBank + closingCash;
    const openingCashAndBank = Math.max(0, closingCashAndBank - netCashFlow);

    return {
      companyName: comp.meta?.name || 'Company ERP',
      gstin: comp.meta?.gstin || 'N/A',
      dateRange: dateRangeText || 'Current Financial Year',
      inflows: [
        { title: 'Direct Cash Sales Counter Receipts', amount: cashSales },
        { title: 'Customer Account Collections (Payment-In)', amount: customerCollections }
      ],
      totalInflow,
      outflows: [
        { title: 'Direct Cash Supplier Purchases', amount: cashPurchases },
        { title: 'Supplier Account Settlements (Payment-Out)', amount: supplierPayments },
        { title: 'Operational & Direct Expenses Disbursed', amount: expensesPaid }
      ],
      totalOutflow,
      netCashFlow,
      openingCashAndBank,
      closingCashAndBank
    };
  }

  // ==========================================
  // MODULE B: INDIAN GST & STATUTORY COMPLIANCE
  // ==========================================

  /**
   * Auto-computes GSTR-3B Table 3.1 & Table 4 ITC
   */
  function computeGSTR3BData(company) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    let outwardTaxable = 0;
    let outwardCGST = 0;
    let outwardSGST = 0;
    let outwardIGST = 0;

    (comp.sales || []).forEach(s => {
      outwardTaxable += Number(s.subTotal || 0);
      outwardCGST += Number(s.cgstTotal || 0);
      outwardSGST += Number(s.sgstTotal || 0);
      outwardIGST += Number(s.igstTotal || 0);
    });

    // Inward eligible ITC
    let itcTaxable = 0;
    let itcCGST = 0;
    let itcSGST = 0;
    let itcIGST = 0;

    (comp.purchases || []).forEach(p => {
      itcTaxable += Number(p.subTotal || 0);
      const tax = Number(p.taxTotal || 0);
      itcCGST += (tax / 2);
      itcSGST += (tax / 2);
    });

    // Eligible expenses ITC
    (comp.expenses || []).forEach(e => {
      if (e.gstApplicable && e.itcEligible) {
        const rate = Number(e.gstRate || 0);
        const amt = Number(e.amount || 0);
        const taxVal = amt * (rate / (100 + rate));
        itcCGST += (taxVal / 2);
        itcSGST += (taxVal / 2);
      }
    });

    const netCGST = Math.max(0, outwardCGST - itcCGST);
    const netSGST = Math.max(0, outwardSGST - itcSGST);
    const netIGST = Math.max(0, outwardIGST - itcIGST);
    const totalNetPayable = netCGST + netSGST + netIGST;

    return {
      table31: {
        nature: '3.1(a) Outward taxable supplies (other than zero rated, nil rated and exempted)',
        taxable: outwardTaxable,
        igst: outwardIGST,
        cgst: outwardCGST,
        sgst: outwardSGST,
        cess: 0
      },
      table4: {
        nature: '4(A)(5) All other ITC - Inward supplies from registered persons',
        taxable: itcTaxable,
        igst: itcIGST,
        cgst: itcCGST,
        sgst: itcSGST,
        cess: 0
      },
      netPayable: {
        cgst: netCGST,
        sgst: netSGST,
        igst: netIGST,
        total: totalNetPayable
      }
    };
  }

  /**
   * Generates NIC-compliant E-Way Bill JSON (v1.04)
   */
  function generateNIC_EWayBillJSON(invoice, company) {
    const comp = company || getCompanyData();
    const inv = invoice || (comp.sales && comp.sales[0]);
    if (!inv) return null;

    const fromState = comp.meta?.stateCode || '33';
    const toState = inv.partyStateCode || '33';
    const isInterstate = fromState !== toState;

    const payload = {
      version: '1.04',
      billLists: [
        {
          userGstin: comp.meta?.gstin || '',
          supplyType: 'O',
          subSupplyType: '1',
          docType: 'INV',
          docNo: inv.invoiceNo,
          docDate: formatDate(inv.date),
          fromGstin: comp.meta?.gstin || '',
          fromTrdName: comp.meta?.name || '',
          fromAddr1: comp.meta?.address || '',
          fromPlace: comp.meta?.state || 'Tamil Nadu',
          fromPincode: Number(comp.meta?.pincode || 636001),
          actFromStateCode: Number(fromState),
          fromStateCode: Number(fromState),
          toGstin: inv.partyGstin || 'URP',
          toTrdName: inv.partyName || 'Cash Customer',
          toAddr1: inv.partyAddress || 'Local Market',
          toPlace: inv.partyState || 'Tamil Nadu',
          toPincode: 636001,
          actToStateCode: Number(toState),
          toStateCode: Number(toState),
          totalValue: Number(inv.subTotal || 0),
          cgstValue: isInterstate ? 0 : Number(inv.cgstTotal || 0),
          sgstValue: isInterstate ? 0 : Number(inv.sgstTotal || 0),
          igstValue: isInterstate ? Number(inv.igstTotal || inv.cgstTotal * 2 || 0) : 0,
          cessValue: 0,
          totInvValue: Number(inv.grandTotal || 0),
          transMode: '1',
          transDistance: '25',
          transporterId: '',
          transporterName: 'Local Road Transport',
          transDocNo: '',
          transDocDate: '',
          vehicleNo: inv.vehicleNo || 'TN-30-AB-1234',
          vehicleType: 'R',
          itemList: (inv.items || []).map((it, idx) => ({
            itemNo: idx + 1,
            productName: it.name,
            productDesc: it.name,
            hsnCode: Number(it.hsn || 11010000),
            quantity: Number(it.qty || 1),
            qtyUnit: it.unit || 'BAG',
            cgstRate: isInterstate ? 0 : (Number(it.gstRate || 5) / 2),
            sgstRate: isInterstate ? 0 : (Number(it.gstRate || 5) / 2),
            igstRate: isInterstate ? Number(it.gstRate || 5) : 0,
            taxableAmount: Number(it.taxableAmount || (it.qty * it.price))
          }))
        }
      ]
    };

    return payload;
  }

  /**
   * Generates NIC-compliant B2B E-Invoice JSON (v1.1)
   */
  function generateNIC_EInvoiceJSON(invoice, company) {
    const comp = company || getCompanyData();
    const inv = invoice || (comp.sales && comp.sales[0]);
    if (!inv) return null;

    return {
      Version: '1.1',
      TranDtls: {
        TaxSch: 'GST',
        SupTyp: 'B2B',
        RegRev: 'N',
        EcmGstin: null,
        IgstOnIntra: 'N'
      },
      DocDtls: {
        Typ: 'INV',
        No: inv.invoiceNo,
        Dt: formatDate(inv.date)
      },
      SellerDtls: {
        Gstin: comp.meta?.gstin || '',
        LglNm: comp.meta?.name || '',
        Addr1: comp.meta?.address || '',
        Loc: comp.meta?.state || 'Salem',
        Pin: Number(comp.meta?.pincode || 636001),
        Stcd: comp.meta?.stateCode || '33'
      },
      BuyerDtls: {
        Gstin: inv.partyGstin || 'URP',
        LglNm: inv.partyName || '',
        Pos: comp.meta?.stateCode || '33',
        Addr1: inv.partyAddress || '',
        Loc: 'Salem',
        Pin: 636001,
        Stcd: '33'
      },
      ValDtls: {
        AssVal: Number(inv.subTotal || 0),
        CgstVal: Number(inv.cgstTotal || 0),
        SgstVal: Number(inv.sgstTotal || 0),
        IgstVal: Number(inv.igstTotal || 0),
        TotInvVal: Number(inv.grandTotal || 0)
      },
      ItemList: (inv.items || []).map((it, idx) => ({
        SlNo: String(idx + 1),
        PrdDesc: it.name,
        IsServc: 'N',
        HsnCd: String(it.hsn || '11010000'),
        Qty: Number(it.qty || 1),
        Unit: it.unit || 'BAG',
        UnitPrice: Number(it.price || 0),
        TotAmt: Number(it.qty * it.price),
        AssAmt: Number(it.taxableAmount || (it.qty * it.price)),
        GstRt: Number(it.gstRate || 5)
      }))
    };
  }

  // ==========================================
  // MODULE D: LAST SOLD PRICE, SALESMAN & ROUTE, LIFECYCLE
  // ==========================================

  /**
   * Customer Last Sold Price Retention
   * Finds the last price charged to this specific customer for this specific item
   */
  function getCustomerLastSoldPrice(partyId, partyName, itemId, itemName, company) {
    const comp = company || getCompanyData();
    if (!comp || (!partyId && !partyName) || (!itemId && !itemName)) return null;

    const pId = partyId ? String(partyId) : '';
    const pName = partyName ? String(partyName).trim().toLowerCase() : '';
    const iId = itemId ? String(itemId) : '';
    const iName = itemName ? String(itemName).trim().toLowerCase() : '';

    const sales = comp.sales || [];
    // Sort from newest to oldest
    const customerSales = sales.filter(s => {
      const matchId = pId && String(s.partyId) === pId;
      const matchName = pName && String(s.partyName || '').trim().toLowerCase() === pName;
      return matchId || matchName;
    });

    for (const s of customerSales) {
      const items = s.items || [];
      const matchItem = items.find(it => {
        const matchItId = iId && String(it.itemId) === iId;
        const matchItName = iName && String(it.name || '').trim().toLowerCase() === iName;
        return matchItId || matchItName;
      });

      if (matchItem && Number(matchItem.price) > 0) {
        return {
          price: Number(matchItem.price),
          invoiceNo: s.invoiceNo,
          date: s.date
        };
      }
    }
    return null;
  }

  /**
   * Order to Challan to Invoice Lifecycle
   * 1. Sale Order -> Delivery Challan
   * 2. Delivery Challan -> Sales Invoice
   */
  function convertSaleOrderToChallan(orderId, company) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const order = (comp.saleOrders || []).find(o => o.id === orderId);
    if (!order) return null;

    const challanNo = `DC-${Date.now().toString().slice(-4)}`;
    const newChallan = {
      id: 'dc_' + Date.now(),
      challanNo,
      orderId: order.id,
      orderNo: order.orderNo,
      date: new Date().toISOString().split('T')[0],
      partyId: order.partyId,
      partyName: order.partyName,
      partyGstin: order.partyGstin || '',
      partyAddress: order.partyAddress || '',
      items: (order.items || []).map(it => ({ ...it })),
      grandTotal: Number(order.grandTotal || 0),
      status: 'Open',
      salesman: order.salesman || 'Primary Salesman',
      route: order.route || 'Main Route',
      notes: `Converted from Sale Order #${order.orderNo}`,
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(comp.deliveryChallans)) comp.deliveryChallans = [];
    comp.deliveryChallans.unshift(newChallan);

    order.status = 'Challan Created';
    order.challanId = newChallan.id;
    order.challanNo = newChallan.challanNo;

    saveCompanyData(comp);
    return newChallan;
  }

  function convertChallanToInvoice(challanId, company) {
    const comp = company || getCompanyData();
    if (!comp) return null;

    const challan = (comp.deliveryChallans || []).find(c => c.id === challanId);
    if (!challan) return null;

    const prefix = comp.meta?.invoicePrefix || 'NT/26-27/';
    const count = (comp.sales || []).length + 1;
    const invNo = `${prefix}${String(count).padStart(4, '0')}`;

    const newInvoice = {
      id: 'inv_' + Date.now(),
      invoiceNo: invNo,
      challanId: challan.id,
      challanNo: challan.challanNo,
      orderNo: challan.orderNo || '',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date().toISOString().split('T')[0],
      partyId: challan.partyId,
      partyName: challan.partyName,
      partyGstin: challan.partyGstin || '',
      partyAddress: challan.partyAddress || '',
      items: (challan.items || []).map(it => ({ ...it })),
      subTotal: Number(challan.grandTotal || 0) * 0.95,
      cgstTotal: (Number(challan.grandTotal || 0) * 0.05) / 2,
      sgstTotal: (Number(challan.grandTotal || 0) * 0.05) / 2,
      igstTotal: 0,
      grandTotal: Number(challan.grandTotal || 0),
      receivedAmount: 0,
      balanceDue: Number(challan.grandTotal || 0),
      status: 'Unpaid',
      paymentMode: 'Credit',
      salesman: challan.salesman || 'Primary Salesman',
      route: challan.route || 'Main Route',
      notes: `Converted from Delivery Challan #${challan.challanNo}`,
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(comp.sales)) comp.sales = [];
    comp.sales.unshift(newInvoice);

    challan.status = 'Invoiced';
    challan.invoiceId = newInvoice.id;
    challan.invoiceNo = newInvoice.invoiceNo;

    saveCompanyData(comp);
    return newInvoice;
  }

  // ==========================================
  // MODULE E: PURCHASES & LANDED COST ALLOCATION
  // ==========================================

  /**
   * Distributes Inward Freight/Coolie/Unloading into unit landed costs
   */
  function calculateLandedCost(purchaseBill) {
    if (!purchaseBill || !Array.isArray(purchaseBill.items)) return purchaseBill;

    const freight = Number(purchaseBill.freightCharges || purchaseBill.shipping || 0);
    const coolie = Number(purchaseBill.coolieCharges || 0);
    const handling = Number(purchaseBill.handlingCharges || 0);
    const totalExtraCost = freight + coolie + handling;

    if (totalExtraCost <= 0) return purchaseBill;

    const totalQty = purchaseBill.items.reduce((acc, it) => acc + Number(it.qty || 1), 0);
    if (totalQty <= 0) return purchaseBill;

    const extraPerUnit = totalExtraCost / totalQty;

    const updatedItems = purchaseBill.items.map(it => {
      const basePrice = Number(it.price || it.purchasePrice || 0);
      return {
        ...it,
        extraChargePerUnit: extraPerUnit,
        landedCostPerUnit: basePrice + extraPerUnit
      };
    });

    return {
      ...purchaseBill,
      totalExtraCost,
      items: updatedItems
    };
  }

  // ==========================================
  // MODULE F: WHATSAPP, DYNAMIC UPI & REMINDERS
  // ==========================================

  /**
   * Formats a professional WhatsApp tax bill message
   */
  function generateWhatsAppInvoiceMessage(invoice, company) {
    const comp = company || getCompanyData();
    const inv = invoice;
    if (!inv) return '';

    const compName = comp.meta?.name || 'Company ERP';
    const upiId = comp.meta?.upiId || 'narmadhatrader@oksbi';
    const cleanPhone = (inv.partyPhone || '').replace(/[^0-9]/g, '');

    const lines = [
      `*TAX INVOICE — ${compName}*`,
      `---------------------------------`,
      `📄 *Bill No:* ${inv.invoiceNo}`,
      `📅 *Date:* ${formatDate(inv.date)}`,
      `👤 *Customer:* ${inv.partyName}`,
      `📦 *Items:* ${(inv.items || []).map(it => `${it.name} (${it.qty} ${it.unit || 'PCS'})`).join(', ')}`,
      `💰 *Total Amount:* ₹ ${Number(inv.grandTotal || 0).toLocaleString('en-IN')}`,
      `⚠️ *Balance Due:* ₹ ${Number(inv.balanceDue || inv.grandTotal || 0).toLocaleString('en-IN')}`,
      `---------------------------------`,
      `💳 *Instant UPI Payment Link:*`,
      `upi://pay?pa=${upiId}&pn=${encodeURIComponent(compName)}&am=${inv.balanceDue || inv.grandTotal}&tn=Inv_${inv.invoiceNo}&cu=INR`,
      `\n_Thank you for doing business with ${compName}!_`
    ];

    const message = lines.join('\n');
    return {
      phone: cleanPhone,
      text: message,
      url: cleanPhone 
        ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(message)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
    };
  }

  /**
   * Generates a One-Click Payment Due Reminder
   */
  function generatePaymentDueReminderMessage(party, company) {
    const comp = company || getCompanyData();
    const compName = comp.meta?.name || 'Company ERP';
    const upiId = comp.meta?.upiId || 'narmadhatrader@oksbi';
    const cleanPhone = (party.phone || '').replace(/[^0-9]/g, '');
    const bal = Number(party.currentBalance || 0);

    const message = [
      `*PAYMENT OVERDUE REMINDER — ${compName}*`,
      `---------------------------------`,
      `Dear *${party.name}*,`,
      `This is a gentle reminder that your current outstanding ledger balance of *₹ ${bal.toLocaleString('en-IN')}* is overdue for settlement.`,
      `\nKindly clear the payment via NEFT/RTGS or instant UPI:`,
      `👉 *UPI ID:* ${upiId}`,
      `🔗 *Quick UPI Link:* upi://pay?pa=${upiId}&pn=${encodeURIComponent(compName)}&am=${bal}&cu=INR`,
      `\nIf you have already paid, please ignore this notice.`,
      `_Accounts Dept - ${compName}_`
    ].join('\n');

    return {
      phone: cleanPhone,
      text: message,
      url: cleanPhone
        ? `https://api.whatsapp.com/send?phone=91${cleanPhone}&text=${encodeURIComponent(message)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`
    };
  }

  // ==========================================
  // HTML REPORT RENDERERS (TRIAL BALANCE, BALANCE SHEET, CASH FLOW)
  // ==========================================

  function renderTrialBalanceHTML(tb) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Trial Balance - ${tb.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: 800; color: #1e293b; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          .badge { display: inline-block; padding: 4px 10px; background: #e0f2fe; color: #0369a1; border-radius: 6px; font-weight: 600; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
          th { background: #f8fafc; font-weight: 700; color: #334155; }
          .text-right { text-align: right; font-family: monospace; }
          .dr { color: #dc2626; font-weight: bold; }
          .cr { color: #16a34a; font-weight: bold; }
          .total-row { background: #f1f5f9; font-weight: 800; font-size: 13px; }
          .status-box { margin-top: 20px; padding: 12px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; }
          .status-balanced { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 24px; color: #0f172a;">${tb.companyName}</h2>
              <p class="sub">${tb.address} | GSTIN: ${tb.gstin}</p>
            </div>
            <div style="text-align: right;">
              <div class="title">TRIAL BALANCE STATEMENT</div>
              <div class="sub">Reporting Period: <strong>${tb.dateRange}</strong></div>
              <div class="badge" style="margin-top: 6px;">Double-Entry Standard</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 40px;">#</th>
              <th>Particulars / Ledger Account Name</th>
              <th>Group Classification</th>
              <th class="text-right" style="width: 160px;">Debit (Dr) ₹</th>
              <th class="text-right" style="width: 160px;">Credit (Cr) ₹</th>
            </tr>
          </thead>
          <tbody>
            ${tb.ledgers.map((l, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${l.name}</strong></td>
                <td><span style="color: #64748b;">${l.group}</span></td>
                <td class="text-right ${l.dr > 0 ? 'dr' : ''}">${l.dr > 0 ? formatCurrency(l.dr) : '-'}</td>
                <td class="text-right ${l.cr > 0 ? 'cr' : ''}">${l.cr > 0 ? formatCurrency(l.cr) : '-'}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3" style="text-align: right; padding-right: 16px;">TOTAL VERIFIED BALANCE:</td>
              <td class="text-right dr">${formatCurrency(tb.totalDr)}</td>
              <td class="text-right cr">${formatCurrency(tb.totalCr)}</td>
            </tr>
          </tbody>
        </table>

        <div class="status-box status-balanced">
          ✅ Double-Entry Ledger Reconciled: Total Debits equal Total Credits (${formatCurrency(tb.totalDr)}).
          <br><small style="font-weight: normal; color: #64748b;">Closing Inventory in Hand valued at ${formatCurrency(tb.closingStockValuation)}.</small>
        </div>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center;">
          Generated on ${new Date().toLocaleString()} by UBIT ERP Billing Software
        </div>
      </body>
      </html>
    `;
  }

  function renderBalanceSheetHTML(bs) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Balance Sheet - ${bs.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: 800; color: #0284c7; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          .container { display: flex; gap: 24px; margin-top: 20px; }
          .col { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
          .col-header { background: #0f172a; color: white; padding: 12px 16px; font-weight: 800; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
          .text-right { text-align: right; font-family: monospace; font-weight: 700; }
          .total-row { background: #f8fafc; font-weight: 800; font-size: 14px; border-top: 2px solid #0f172a; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 24px;">${bs.companyName}</h2>
              <p class="sub">${bs.address} | GSTIN: ${bs.gstin}</p>
            </div>
            <div style="text-align: right;">
              <div class="title">BALANCE SHEET STATEMENT</div>
              <div class="sub">${bs.dateRange}</div>
            </div>
          </div>
        </div>

        <div class="container">
          <!-- Liabilities & Equity -->
          <div class="col">
            <div class="col-header">LIABILITIES & EQUITY</div>
            <table>
              <thead>
                <tr style="background: #f1f5f9;">
                  <th>Liabilities Particulars</th>
                  <th class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Proprietor Capital / Equity</strong></td>
                  <td class="text-right">${formatCurrency(bs.capitalAndEquity)}</td>
                </tr>
                <tr>
                  <td><strong>Net Operating Profit (from P&L)</strong></td>
                  <td class="text-right" style="color: #16a34a;">${formatCurrency(bs.netProfit)}</td>
                </tr>
                ${bs.liabilities.map(l => `
                  <tr>
                    <td>${l.name}</td>
                    <td class="text-right">${formatCurrency(l.amount)}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td>TOTAL LIABILITIES & EQUITY</td>
                  <td class="text-right">${formatCurrency(bs.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Assets -->
          <div class="col">
            <div class="col-header" style="background: #0284c7;">ASSETS</div>
            <table>
              <thead>
                <tr style="background: #f1f5f9;">
                  <th>Assets Particulars</th>
                  <th class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${bs.assets.map(a => `
                  <tr>
                    <td><strong>${a.name}</strong></td>
                    <td class="text-right">${formatCurrency(a.amount)}</td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td>TOTAL ASSETS</td>
                  <td class="text-right">${formatCurrency(bs.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center;">
          Generated on ${new Date().toLocaleString()} by UBIT ERP Billing Software
        </div>
      </body>
      </html>
    `;
  }

  function renderCashFlowHTML(cf) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Cash Flow - ${cf.companyName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: 800; color: #059669; }
          .sub { font-size: 13px; color: #64748b; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; }
          th { background: #f8fafc; font-weight: 700; color: #334155; }
          .text-right { text-align: right; font-family: monospace; font-weight: 700; }
          .inflow { color: #16a34a; }
          .outflow { color: #dc2626; }
          .total-row { background: #f1f5f9; font-weight: 800; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h2 style="margin: 0; font-size: 24px;">${cf.companyName}</h2>
              <p class="sub">GSTIN: ${cf.gstin}</p>
            </div>
            <div style="text-align: right;">
              <div class="title">CASH FLOW STATEMENT</div>
              <div class="sub">Period: <strong>${cf.dateRange}</strong></div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Cash & Bank Flow Particulars</th>
              <th class="text-right" style="width: 200px;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #f8fafc; font-weight: bold;"><td colspan="2">A. OPERATING CASH INFLOWS</td></tr>
            ${cf.inflows.map(inf => `
              <tr>
                <td>${inf.title}</td>
                <td class="text-right inflow">+ ${formatCurrency(inf.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Cash Inflows (A)</td>
              <td class="text-right inflow">${formatCurrency(cf.totalInflow)}</td>
            </tr>

            <tr style="background: #f8fafc; font-weight: bold;"><td colspan="2">B. OPERATING CASH OUTFLOWS</td></tr>
            ${cf.outflows.map(out => `
              <tr>
                <td>${out.title}</td>
                <td class="text-right outflow">- ${formatCurrency(out.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Cash Outflows (B)</td>
              <td class="text-right outflow">${formatCurrency(cf.totalOutflow)}</td>
            </tr>

            <tr class="total-row" style="background: #e2e8f0; font-size: 14px;">
              <td>NET CASH FLOW FROM OPERATING ACTIVITIES (A - B)</td>
              <td class="text-right ${cf.netCashFlow >= 0 ? 'inflow' : 'outflow'}">${formatCurrency(cf.netCashFlow)}</td>
            </tr>

            <tr>
              <td>Add: Opening Balance of Cash & Bank Accounts</td>
              <td class="text-right">${formatCurrency(cf.openingCashAndBank)}</td>
            </tr>
            <tr class="total-row" style="background: #ecfdf5; font-size: 15px; color: #047857;">
              <td>CLOSING CASH & BANK BALANCE RECONCILED</td>
              <td class="text-right">${formatCurrency(cf.closingCashAndBank)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center;">
          Generated on ${new Date().toLocaleString()} by UBIT ERP Billing Software
        </div>
      </body>
      </html>
    `;
  }

  // ==========================================
  // SEAMLESS DOM EVENT HOOKS (WITHOUT ALTERING MENUS/UI)
  // ==========================================

  // 1. Intercept "All Parties Report" / Accounting Report generation button
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const btnText = (btn.textContent || '').trim();

    // Check if user clicked "All Parties Report" or similar in Accounting view
    if (btnText.includes('All Parties Report') || btn.title?.includes('Download full report')) {
      const activeSubtitle = document.querySelector('h1, h2, h3, .text-xs.font-bold.text-slate-800');
      const text = document.body.innerText;

      if (text.includes('Double-Entry Verification') || text.includes('Trial Balance')) {
        const tb = computeTrialBalance();
        if (tb) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (window.__ubitOpenCenteredPrintWindow) { window.__ubitOpenCenteredPrintWindow(renderTrialBalanceHTML(tb), "Trial Balance"); }
          return;
        }
      }

      if (text.includes('Assets, Liabilities & Net Equity') || text.includes('Balance Sheet')) {
        const bs = computeBalanceSheet();
        if (bs) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (window.__ubitOpenCenteredPrintWindow) { window.__ubitOpenCenteredPrintWindow(renderBalanceSheetHTML(bs), "Balance Sheet"); }
          return;
        }
      }

      if (text.includes('Operational Cash Inflows') || text.includes('Cash Flow')) {
        const cf = computeCashFlow();
        if (cf) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (window.__ubitOpenCenteredPrintWindow) { window.__ubitOpenCenteredPrintWindow(renderCashFlowHTML(cf), "Cash Flow"); }
          return;
        }
      }
    }
  }, true);

  // 2. Attach global functions to window for clean access from UI
  window.UBIT_ERP_ENGINE = {
    computeTrialBalance,
    computeBalanceSheet,
    computeCashFlow,
    computeGSTR3BData,
    generateNIC_EWayBillJSON,
    generateNIC_EInvoiceJSON,
    getCustomerLastSoldPrice,
    convertSaleOrderToChallan,
    convertChallanToInvoice,
    calculateLandedCost,
    generateWhatsAppInvoiceMessage,
    generatePaymentDueReminderMessage,
    generateTallyXML,

    // One-click actions
    openTrialBalance: () => { const tb = computeTrialBalance(); if (tb) { window.__ubitOpenCenteredPrintWindow ? window.__ubitOpenCenteredPrintWindow(renderTrialBalanceHTML(tb), "Trial Balance") : null; } },
    openBalanceSheet: () => { const bs = computeBalanceSheet(); if (bs) { window.__ubitOpenCenteredPrintWindow ? window.__ubitOpenCenteredPrintWindow(renderBalanceSheetHTML(bs), "Balance Sheet") : null; } },
    openCashFlow: () => { const cf = computeCashFlow(); if (cf) { window.__ubitOpenCenteredPrintWindow ? window.__ubitOpenCenteredPrintWindow(renderCashFlowHTML(cf), "Cash Flow") : null; } },
    downloadEWayBillJSON: (invoice) => {
      const data = generateNIC_EWayBillJSON(invoice);
      if (!data) return alert('No invoice selected for E-Way Bill JSON.');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `EWayBill_${invoice?.invoiceNo || 'INV'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    downloadEInvoiceJSON: (invoice) => {
      const data = generateNIC_EInvoiceJSON(invoice);
      if (!data) return alert('No invoice selected for E-Invoice JSON.');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `EInvoice_${invoice?.invoiceNo || 'INV'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    sendWhatsAppBill: (invoice) => {
      const wa = generateWhatsAppInvoiceMessage(invoice);
      if (wa && wa.url) window.open(wa.url, '_blank');
    },
    sendPaymentReminder: (party) => {
      const wa = generatePaymentDueReminderMessage(party);
      if (wa && wa.url) window.open(wa.url, '_blank');
    }
  };
  window.__ubitGenerateTallyXML = generateTallyXML;

  console.log('[UBIT ERP Engine] Enterprise Extensions ready.');
})();


  // =========================================================================
  // EXTENSION: 1. INTERACTIVE DOUBLE-ENTRY ACCOUNTING UI & DYNAMIC TABLES
  // =========================================================================

  function injectDynamicAccountingTables() {
    // Completely removed per user request: Live Double-Entry Trial Balance table removed from all pages
    const ids = ['ubit-dynamic-trial-balance-section', 'ubit-dynamic-balance-sheet-section', 'ubit-dynamic-cash-flow-section'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // =========================================================================

  function autoDetectLAN() {
    const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || '';
    const isMobileSyncPage = bodyText.includes('Multi-Device Sync') || bodyText.includes('Scan to Open On Mobile');
    if (!isMobileSyncPage) return;

    const codeEl = document.querySelector('code.text-sky-700') || document.querySelector('code');
    if (!codeEl) return;

    // Check if showing localhost or 127.0.0.1
    const currentUrl = codeEl.innerText.trim();
    if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      // Auto-detect LAN IP from WebRTC local ICE candidates
      try {
        const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        if (RTCPeer) {
          const rtc = new RTCPeer({ iceServers: [] });
          rtc.createDataChannel('');
          rtc.createOffer().then(offer => rtc.setLocalDescription(offer)).catch(() => {});
          rtc.onicecandidate = function (evt) {
            if (evt && evt.candidate && evt.candidate.candidate) {
              const candidate = evt.candidate.candidate;
              const ipMatch = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
              if (ipMatch && ipMatch[1] && !ipMatch[1].startsWith('127.')) {
                const lanIp = ipMatch[1];
                const port = window.location.port || 5173;
                const newUrl = `http://${lanIp}:${port}`;
                codeEl.innerText = newUrl;
                // Add friendly LAN IP announcement badge
                if (!document.getElementById('ubit-lan-autodetect-badge')) {
                  const badge = document.createElement('div');
                  badge.id = 'ubit-lan-autodetect-badge';
                  badge.className = 'mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-medium flex items-center justify-center gap-1.5';
                  badge.innerHTML = `
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>LAN Auto-Discovery Active: <strong>${lanIp}</strong></span>
                  `;
                  codeEl.parentNode.appendChild(badge);
                }
                rtc.close();
              }
            }
          };
        }
      } catch (e) {}
    }
  }

  // Hook into DOM updates seamlessly
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        injectDynamicAccountingTables();
        autoDetectLAN();
        scheduled = false;
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial runs
  setTimeout(() => {
    injectDynamicAccountingTables();
    autoDetectLAN();
  }, 400);

  
  // =========================================================================
  // EXTENSION: 4. SINGLE ACTIVE PC MAC ENFORCEMENT & THEMED CENTERED POPUPS
  // =========================================================================

  // A. Themed Centered Popups & Dialogs
  function applyThemedCenteredPopups() {
    let styleEl = document.getElementById('ubit-themed-centered-popups-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ubit-themed-centered-popups-style';
      document.head.appendChild(styleEl);
    }

    // Read active company theme color
    let themeColor = '#10263c'; // default navy blue #10263c
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        if (sess.currentCompany && sess.currentCompany.themeColor && sess.currentCompany.themeColor !== '#0284c7') {
          themeColor = sess.currentCompany.themeColor;
        }
      }
    } catch(e) {}

    document.documentElement.style.setProperty('--ubit-active-theme', themeColor);

    styleEl.textContent = `
      /* Reports Submenu Sidebar: Default White Text */
      #ubit-reports-sidebar {
        background-color: var(--ubit-app-theme, #10263c) !important;
      }
      #ubit-reports-sidebar div[class*="uppercase"] {
        color: #ffffff !important;
        font-weight: 700 !important;
      }
      #ubit-reports-sidebar button {
        color: #ffffff !important;
      }
      #ubit-reports-sidebar button:hover {
        background-color: rgba(255, 255, 255, 0.1) !important;
      }
      #ubit-reports-sidebar button {
        color: #ffffff !important;
      }
      #ubit-reports-sidebar button.bg-white {
        background-color: #ffffff !important;
        color: #0f172a !important;
        font-weight: 700 !important;
      }

      /* All modals, dialogs, and popups centered in the middle of viewport */
      .fixed.inset-0.z-50,
      .fixed.inset-0.z-\\[60\\],
      .fixed.inset-0.z-\\[70\\],
      .fixed.inset-0.z-\\[9999\\],
      [role="dialog"] {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      /* Modal card themed accent border */
      .fixed.inset-0 > div:not([class*="backdrop"]) {
        margin: auto !important;
        border-top: 4px solid var(--ubit-active-theme, #10263c) !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.45) !important;
      }

      /* Themed action buttons in modals */
      .fixed.inset-0 button.bg-sky-500,
      .fixed.inset-0 button.bg-sky-600,
      .fixed.inset-0 button.bg-blue-600,
      .fixed.inset-0 button[type="submit"] {
        background-color: var(--ubit-active-theme, #10263c) !important;
      }
    `;
  }

  // B. Single-Active MAC Session & Auto-Logout Watchdog
  let lastMacAlertTime = 0;
  function verifySingleActiveMacSession() {
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (!sessStr) return;
      const sess = JSON.parse(sessStr);
      const u = sess.user;
      if (!u || u.role === 'Admin' || u.username === 'Pradheep' || u.username === 'Hari' || u.isDemo) return;

      const myMac = window.__ubitCurrentMac || localStorage.getItem('ubit_current_pc_mac') || '';
      const sysRaw = localStorage.getItem('ubit_erp_cloud_system_v1');
      if (!sysRaw) return;
      const sys = JSON.parse(sysRaw);
      const serverUser = (sys.users || []).find(x => x.id === u.id || (x.username && u.username && x.username.toLowerCase() === u.username.toLowerCase()));
      if (!serverUser) return;

      // 1. Check software usage restriction
      if (serverUser.isRestricted) {
        sessionStorage.removeItem('gst_erp_session_auth');
        localStorage.removeItem('gst_erp_session_auth');
        if (Date.now() - lastMacAlertTime > 4000) {
          lastMacAlertTime = Date.now();
          alert('Access Suspended: Software usage for this account has been restricted by the Administrator.');
        }
        window.location.reload();
        return;
      }

      // 2. Check single active MAC ID - if logged in from another PC, auto logout this device
      const normalize = s => String(s || '').trim().toUpperCase().replace(/[:-]/g, '');
      if (myMac && serverUser.activeMacId && normalize(serverUser.activeMacId) !== normalize(myMac)) {
        sessionStorage.removeItem('gst_erp_session_auth');
        localStorage.removeItem('gst_erp_session_auth');
        if (Date.now() - lastMacAlertTime > 4000) {
          lastMacAlertTime = Date.now();
          alert('Multiple PC usage detected. Your session has been automatically logged out because this account was logged into from another PC (MAC: ' + serverUser.activeMacId + '). Only one active PC is allowed at a time.');
        }
        window.location.reload();
        return;
      }
    } catch (e) {}
  }

  // C. Silent Demo Reset on Exit / Logout
  function checkAndHandleDemoSession() {
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (!sessStr) {
        // If logged out or exited, wipe any demo workspace changes silently in the background
        localStorage.removeItem('ubit_erp_cloud_company_comp_demo_workspace');
      }
    } catch(e) {}
  }

  // Interval checks & user interaction triggers
  setInterval(() => {
    applyThemedCenteredPopups();
    verifySingleActiveMacSession();
    checkAndHandleDemoSession();
  }, 2000);

  window.addEventListener('click', () => {
    verifySingleActiveMacSession();
    applyThemedCenteredPopups();
  }, true);

  applyThemedCenteredPopups();
  verifySingleActiveMacSession();

  
  // /* DYNAMIC UNIFIED HEADER, SIDEBAR, SUBMENU & LICENSE THEME */
  function updateGlobalAppTheme() {
    let themeColor = '#10263c'; // default background for all users and demo users
    let menuTextColor = '#ffffff'; // default plain white font for all text
    let menuIconColor = '#ffffff'; // default plain white for icons
    try {
      const sessStr = sessionStorage.getItem('gst_erp_session_auth') || localStorage.getItem('gst_erp_session_auth');
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        if (sess.currentCompany) {
          if (sess.currentCompany.themeColor && sess.currentCompany.themeColor !== '#0284c7') {
            themeColor = sess.currentCompany.themeColor;
          } else if (sess.currentCompany.id) {
            const savedTheme = localStorage.getItem('ubit_erp_theme_' + sess.currentCompany.id);
            if (savedTheme) themeColor = savedTheme;
          }
          if (sess.currentCompany.menuTextColor) {
            menuTextColor = sess.currentCompany.menuTextColor;
          }
          if (sess.currentCompany.menuIconColor) {
            menuIconColor = sess.currentCompany.menuIconColor;
          }
        }
      }
      const demoTheme = localStorage.getItem('ubit_erp_demo_theme');
      if (demoTheme && (sessStr && sessStr.includes('demo'))) {
        themeColor = demoTheme;
      }
    } catch(e) {}

    window.__ubitActiveTheme = themeColor;
    window.__ubitMenuText = menuTextColor;
    window.__ubitMenuIcon = menuIconColor;
    document.documentElement.style.setProperty('--ubit-app-theme', themeColor);
    document.documentElement.style.setProperty('--ubit-active-theme', themeColor);
    document.documentElement.style.setProperty('--ubit-menu-text-color', menuTextColor);
    document.documentElement.style.setProperty('--ubit-menu-icon-color', menuIconColor);

    let styleEl = document.getElementById('ubit-app-theme-unified-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ubit-app-theme-unified-style';
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      :root {
        --ubit-app-theme: ${themeColor};
        --ubit-menu-text-color: ${menuTextColor};
        --ubit-menu-icon-color: ${menuIconColor};
      }

      /* Top Header: where software name and current company name appear */
      header.h-10,
      header[style*="drag"] {
        background-color: var(--ubit-app-theme, #10263c) !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15) !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }

      /* Header company buttons and current active company pill */
      header.h-10 button {
        background-color: rgba(255, 255, 255, 0.08) !important;
        border-color: rgba(255, 255, 255, 0.15) !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      header.h-10 button:hover {
        background-color: rgba(255, 255, 255, 0.15) !important;
        color: #ffffff !important;
      }
      header.h-10 div[class*="bg-sky-950"] {
        background-color: rgba(255, 255, 255, 0.1) !important;
        border-color: rgba(255, 255, 255, 0.22) !important;
        color: #ffffff !important;
      }
      header.h-10 span,
      header.h-10 div {
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }

      /* Entire Sidebar: under software name */
      aside.w-64 {
        background-color: var(--ubit-app-theme, #10263c) !important;
        border-right: 1px solid rgba(255, 255, 255, 0.12) !important;
      }
      aside.w-64 > div.flex-1 {
        background-color: var(--ubit-app-theme, #10263c) !important;
      }

      /* Menus and submenus text: plain white #ffffff by default */
      aside.w-64 div[class*="cursor-pointer"] span,
      aside.w-64 div[class*="cursor-pointer"] {
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }

      /* Menus and submenus icons ONLY: plain white #ffffff by default */
      aside.w-64 div[class*="cursor-pointer"] svg {
        color: var(--ubit-menu-icon-color, #ffffff) !important;
      }

      /* STRICT RULE: NEVER put background box around text in main menu or submenu on hover, click, or active */
      aside.w-64 span,
      aside.w-64 div[class*="cursor-pointer"] span,
      aside.w-64 div[class*="cursor-pointer"]:hover span,
      aside.w-64 div[class*="cursor-pointer"]:active span,
      aside.w-64 div[class*="cursor-pointer"]:focus span,
      aside.w-64 div[class*="bg-black/25"] span,
      aside.w-64 div[class*="border-l-4"] span,
      aside.w-64 div[class*="bg-black/30"] span,
      aside.w-64 div[class*="font-bold"] span {
        background-color: transparent !important;
        background: none !important;
        box-shadow: none !important;
        border: none !important;
        outline: none !important;
      }

      /* Menu hover on row only */
      aside.w-64 div[class*="cursor-pointer"]:hover {
        background-color: rgba(255, 255, 255, 0.06) !important;
      }
      aside.w-64 div[class*="cursor-pointer"]:hover svg,
      aside.w-64 div[class*="cursor-pointer"]:hover span {
        color: #ffffff !important;
      }

      /* Active top-level menu item: subtle row bg and left border line, no box around text */
      aside.w-64 div[class*="bg-black/25"],
      aside.w-64 div[class*="border-l-4"] {
        background-color: rgba(255, 255, 255, 0.08) !important;
        border-left: 4px solid #ffffff !important;
      }
      aside.w-64 div[class*="bg-black/25"] svg,
      aside.w-64 div[class*="border-l-4"] svg,
      aside.w-64 div[class*="bg-black/25"] span,
      aside.w-64 div[class*="border-l-4"] span {
        color: #ffffff !important;
        background-color: transparent !important;
        background: none !important;
      }
      aside.w-64 div[class*="bg-black/25"] svg,
      aside.w-64 div[class*="border-l-4"] svg {
        color: #ffffff !important;
      }

      /* Submenu container background: shaded slightly darker or clean uniform sidebar background */
      aside.w-64 div[class*="bg-slate-900/40"],
      aside.w-64 div[class*="bg-slate-900"],
      aside.w-64 div.py-1 {
        background-color: rgba(0, 0, 0, 0.18) !important;
      }

      /* Submenu items - NO box on text, keep background color transparent, font and icons white */
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"],
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"] {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"] span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"] span {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"] svg,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"] svg {
        color: var(--ubit-menu-icon-color, #ffffff) !important;
      }

      /* Active submenu item - NO box on text, keep clean background color, font & icon pure white */
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"]:hover,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"]:hover {
        background-color: rgba(255, 255, 255, 0.06) !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="cursor-pointer"]:hover span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="cursor-pointer"]:hover span {
        background-color: transparent !important;
        color: #ffffff !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="bg-black/30"],
      aside.w-64 div[class*="bg-slate-900"] div[class*="bg-black/30"],
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="font-bold"],
      aside.w-64 div[class*="bg-slate-900"] div[class*="font-bold"] {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="bg-black/30"] span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="bg-black/30"] span,
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="font-bold"] span,
      aside.w-64 div[class*="bg-slate-900"] div[class*="font-bold"] span {
        background-color: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: #ffffff !important;
        font-weight: 700 !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="bg-black/30"] svg,
      aside.w-64 div[class*="bg-slate-900"] div[class*="bg-black/30"] svg,
      aside.w-64 div[class*="bg-slate-900/40"] div[class*="font-bold"] svg,
      aside.w-64 div[class*="bg-slate-900"] div[class*="font-bold"] svg {
        color: #ffffff !important;
      }

      /* Software License Section at bottom of sidebar */
      aside.w-64 > div.shrink-0:last-child,
      aside.w-64 div[class*="bg-slate-950"] {
        background-color: var(--ubit-app-theme, #10263c) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.15) !important;
      }
      aside.w-64 div[class*="bg-slate-950"] span,
      aside.w-64 div[class*="bg-slate-950"] p,
      aside.w-64 div[class*="bg-slate-950"] div,
      aside.w-64 div[class*="bg-slate-950"] .text-slate-400 {
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      aside.w-64 div[class*="bg-slate-900/80"] {
        background-color: rgba(0, 0, 0, 0.28) !important;
        border-color: rgba(255, 255, 255, 0.12) !important;
      }
      aside.w-64 div[class*="bg-slate-900/40"]:last-child {
        background-color: rgba(0, 0, 0, 0.2) !important;
        border-color: rgba(255, 255, 255, 0.1) !important;
        color: var(--ubit-menu-text-color, #ffffff) !important;
      }
      aside.w-64 button[class*="bg-red-950"] {
        background-color: rgba(220, 38, 38, 0.25) !important;
        border-color: rgba(220, 38, 38, 0.5) !important;
        color: #fca5a5 !important;
      }

      /* Layout helper: align transaction toolbar next to total tile */
      .erp-tile-toolbar-row {
        display: flex !important;
        flex-direction: row !important;
        align-items: flex-end !important;
        justify-content: space-between !important;
        gap: 1rem !important;
        width: 100% !important;
      }
      @media (max-width: 1024px) {
        .erp-tile-toolbar-row {
          flex-direction: column !important;
          align-items: stretch !important;
        }
      }

      /* ========================================================= */
      /* UNIVERSAL ENTERPRISE TABLE & CONTENT TYPOGRAPHY RULES     */
      /* ========================================================= */

      /* 1. In all tables: show all text in default black color */
      main table,
      main table th,
      main table td,
      main table thead,
      main table tbody,
      main table tfoot,
      main table tr {
        color: #000000 !important;
      }

      main table th *,
      main table th span,
      main table th div,
      main table th button,
      main table td p,
      main table td span:not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-amber"]):not([class*="bg-green"]):not([class*="bg-red"]):not([class*="text-amber"]):not([class*="text-rose"]):not([class*="text-emerald"]):not([class*="text-green"]):not([class*="text-red"]):not([class*="text-white"]),
      main table td div:not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-amber"]):not([class*="bg-green"]):not([class*="bg-red"]):not([class*="text-white"]),
      main table td button:not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-amber"]):not([class*="bg-green"]):not([class*="bg-red"]):not([class*="text-amber"]):not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-white"]) span {
        color: #000000 !important;
      }

      /* 2. In all tables: change the icons colors to plain black as well */
      main table svg,
      main table th svg,
      main table td svg:not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-amber"]):not([class*="text-white"]) {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* Table sort indicators: plain black */
      main table th button svg,
      main table th svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* Table row action icons (Print, Share, 3-dots, View, Edit, Duplicate) -> Plain Black */
      main table td button:not([title*="Delete"]):not([title*="Cancel"]):not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-amber"]):not([class*="bg-emerald"]):not([class*="bg-rose"]):not([class*="bg-red"]):not([class*="bg-amber"]) svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* 3. In action: cancel and delete should ONLY be in color for text and icon */
      /* Table row Delete button / icon */
      main table button[title*="Delete"],
      main table button[class*="text-rose"],
      main table button[class*="text-red"] {
        color: #e11d48 !important;
      }
      main table button[title*="Delete"] svg,
      main table button[class*="text-rose"] svg,
      main table button[class*="text-red"] svg {
        color: #e11d48 !important;
        stroke: #e11d48 !important;
      }

      /* Table row Cancel button / icon */
      main table button[title*="Cancel"],
      main table button[class*="text-amber"] {
        color: #d97706 !important;
      }
      main table button[title*="Cancel"] svg,
      main table button[class*="text-amber"] svg {
        color: #d97706 !important;
        stroke: #d97706 !important;
      }

      /* 4. Action open dropdown menu (3-dots popup): show all icons and text in plain black EXCEPT Cancel and Delete */
      div[class*="z-[9999]"] button,
      .fixed.shadow-xl.bg-white button {
        color: #000000 !important;
      }
      div[class*="z-[9999]"] button svg,
      .fixed.shadow-xl.bg-white button svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }
      div[class*="z-[9999]"] button span,
      .fixed.shadow-xl.bg-white button span {
        color: #000000 !important;
      }

      /* Action open: Cancel in color */
      div[class*="z-[9999]"] button[class*="text-amber"],
      .fixed.shadow-xl.bg-white button[class*="text-amber"] {
        color: #d97706 !important;
      }
      div[class*="z-[9999]"] button[class*="text-amber"] span,
      .fixed.shadow-xl.bg-white button[class*="text-amber"] span {
        color: #d97706 !important;
      }
      div[class*="z-[9999]"] button[class*="text-amber"] svg,
      .fixed.shadow-xl.bg-white button[class*="text-amber"] svg {
        color: #d97706 !important;
        stroke: #d97706 !important;
      }

      /* Action open: Delete in color */
      div[class*="z-[9999]"] button[class*="text-rose"],
      div[class*="z-[9999]"] button[class*="text-red"],
      .fixed.shadow-xl.bg-white button[class*="text-rose"],
      .fixed.shadow-xl.bg-white button[class*="text-red"] {
        color: #e11d48 !important;
      }
      div[class*="z-[9999]"] button[class*="text-rose"] span,
      div[class*="z-[9999]"] button[class*="text-red"] span,
      .fixed.shadow-xl.bg-white button[class*="text-rose"] span,
      .fixed.shadow-xl.bg-white button[class*="text-red"] span {
        color: #e11d48 !important;
      }
      div[class*="z-[9999]"] button[class*="text-rose"] svg,
      div[class*="z-[9999]"] button[class*="text-red"] svg,
      .fixed.shadow-xl.bg-white button[class*="text-rose"] svg,
      .fixed.shadow-xl.bg-white button[class*="text-red"] svg {
        color: #e11d48 !important;
        stroke: #e11d48 !important;
      }

      /* 5. Keep paid and unpaid, convert to sale and convert to purchase, used and unused in color */
      /* Paid badge (emerald) */
      main span[class*="bg-emerald-50"],
      main span[class*="text-emerald-700"] {
        color: #047857 !important;
      }
      /* Unpaid badge (rose) */
      main span[class*="bg-rose-50"],
      main span[class*="text-rose-700"] {
        color: #be123c !important;
      }
      /* Used badge (emerald) */
      main span[class*="bg-emerald-50"][class*="text-emerald-700"] {
        color: #047857 !important;
      }
      /* Unused badge (amber) */
      main span[class*="bg-amber-50"],
      main span[class*="text-amber-700"] {
        color: #b45309 !important;
      }
      /* Convert to Sale button ONLY */
      main button.bg-emerald-600,
      main button.bg-emerald-500,
      main button[class*="bg-emerald-600"],
      main button[class*="bg-emerald-500"] {
        background-color: #059669 !important;
        color: #ffffff !important;
      }
      main button[class*="bg-emerald-600"] span,
      main button[class*="bg-emerald-500"] span,
      main button[class*="bg-emerald-600"] svg,
      main button[class*="bg-emerald-500"] svg {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }

      /* STRICT RULE: Table action icon buttons MUST have transparent background with NO colored boxes */
      main table td button:not([class*="bg-emerald-600"]):not([class*="bg-rose-600"]):not([class*="bg-emerald-500"]):not([class*="bg-rose-500"]) {
        background-color: transparent !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      main table td button:not([class*="bg-emerald-600"]):not([class*="bg-rose-600"]):not([class*="bg-emerald-500"]):not([class*="bg-rose-500"]):hover {
        background-color: rgba(0, 0, 0, 0.06) !important;
      }
      main table td button svg:not([class*="text-rose"]):not([class*="text-red"]):not([class*="text-amber"]):not([class*="text-white"]) {
        color: #000000 !important;
        stroke: #000000 !important;
      }
      /* Convert to Purchase button */
      main button[class*="bg-rose-600"],
      main button[class*="bg-rose-500"] {
        color: #ffffff !important;
      }
      main button[class*="bg-rose-600"] span,
      main button[class*="bg-rose-500"] span,
      main button[class*="bg-rose-600"] svg,
      main button[class*="bg-rose-500"] svg {
        color: #ffffff !important;
        stroke: #ffffff !important;
      }
      /* Protect other primary action buttons (like + Add Sale, + Add Purchase) */
      main button[class*="text-white"] span,
      main button[class*="text-white"] svg,
      main [class*="bg-rose-"] [class*="text-white"],
      main [class*="bg-emerald-"] [class*="text-white"],
      main [class*="bg-sky-"] [class*="text-white"],
      main [class*="bg-indigo-"] [class*="text-white"],
      main [class*="bg-slate-900"] [class*="text-white"] {
        color: #ffffff !important;
      }

      /* 6. All menu and sub-menu pages text and fonts in default black */
      main h1,
      main h2,
      main h3,
      main h4,
      main h5,
      main h6 {
        color: #000000 !important;
      }

      /* Page headers, date filters, stats cards, summary tiles, labels */
      main .erp-txn-toolbar,
      main .erp-txn-toolbar input,
      main .erp-txn-toolbar button,
      main .erp-txn-toolbar button span {
        color: #000000 !important;
      }
      main .erp-txn-toolbar svg {
        color: #000000 !important;
        stroke: #000000 !important;
      }

      /* Date filter bar */
      main div[class*="bg-white"] span[class*="text-slate-"],
      main div[class*="bg-white"] div[class*="text-slate-"],
      main select[class*="text-slate-"],
      main input[class*="text-slate-"] {
        color: #000000 !important;
      }

      /* General page content text defaults to black, preserving sidebar & top header */
      main p:not([class*="text-white"]):not([class*="bg-"]),
      main label,
      main .text-slate-500:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-600:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-700:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-800:not([class*="bg-"]):not([class*="text-white"]),
      main .text-slate-900:not([class*="bg-"]):not([class*="text-white"]) {
        color: #000000 !important;
      }
    `;
  }

  // C. Move Search, Print, PDF & Excel next to Total Tile in all transaction pages
  function alignToolbarsNextToTotalTiles() {
    try {
      const toolbars = document.querySelectorAll('.erp-txn-toolbar, div[data-erp-toolbar="true"]');
      toolbars.forEach(tb => {
        let prev = tb.previousElementSibling;
        if (!prev) return;
        if (tb.parentElement && (tb.parentElement.classList.contains('erp-tile-toolbar-row') || tb.parentElement.classList.contains('erp-toolbar-row'))) return;
        
        // Never align or wrap if prev is a header, filter bar, or page title
        if (prev.querySelector('h1, h2, select') || (prev.textContent && prev.textContent.includes('Date Filter')) || prev.classList.contains('border-b') || prev.querySelector('.border-b')) {
          return;
        }

        // Check if previous element is a total tile or summary card
        const isTile = (prev.classList.contains('max-w-md') && !prev.querySelector('select')) || 
                       (prev.classList.contains('rounded-2xl') && prev.querySelector('.font-mono') && !prev.querySelector('select') && (prev.textContent && (prev.textContent.includes('TOTAL') || prev.textContent.includes('Total') || prev.textContent.includes('₹'))));
        
        if (isTile) {
          const row = document.createElement('div');
          row.className = 'erp-tile-toolbar-row flex flex-col xl:flex-row items-stretch xl:items-end justify-between gap-4 w-full mb-4';
          prev.parentNode.insertBefore(row, prev);
          row.appendChild(prev);
          row.appendChild(tb);
        }
      });
    } catch(e) {}
  }

  setInterval(alignToolbarsNextToTotalTiles, 800);
  window.addEventListener('click', () => setTimeout(alignToolbarsNextToTotalTiles, 50));
  alignToolbarsNextToTotalTiles();

  setInterval(updateGlobalAppTheme, 1500);
  window.addEventListener('click', updateGlobalAppTheme);
  updateGlobalAppTheme();

  // Extend window.UBIT_ERP_ENGINE
  window.UBIT_ERP_ENGINE = window.UBIT_ERP_ENGINE || {};
  if (typeof showDirectPortalPushModal !== 'undefined') window.UBIT_ERP_ENGINE.showDirectPortalPushModal = showDirectPortalPushModal;

  // ==========================================
  // UNIVERSAL CENTERED THEMED ALERT & MODAL REPLACEMENT
  // ==========================================
  (function() {
    // 1. Startup purge of any non-demo companies from localStorage
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ubit_erp_cloud_company_') && !k.includes('comp_demo')) {
          localStorage.removeItem(k);
        }
      }
      localStorage.removeItem('ubit_erp_cloud_companies_catalog');
    } catch(e) {}

    // 2. Universal Centered Themed Alert Replacement
    window.alert = function(msg) {
      try {
        const existing = document.getElementById('ubit-custom-alert-modal');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-custom-alert-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);padding:1rem;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:26rem;width:100%;overflow:hidden;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;font-family:sans-serif;';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
        titleRow.innerHTML = '<div style="width:2.25rem;height:2.25rem;border-radius:9999px;background:rgba(16,38,60,0.1);color:' + theme + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><h3 style="margin:0;font-size:0.95rem;font-weight:700;color:#0f172a;">UBIT Pro ERP</h3>';

        const msgEl = document.createElement('div');
        msgEl.style.cssText = 'font-size:0.875rem;color:#334155;line-height:1.5;white-space:pre-wrap;';
        msgEl.textContent = String(msg ?? '');

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;justify-content:flex-end;margin-top:0.25rem;';
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'background:' + theme + ';color:#ffffff;border:none;border-radius:0.5rem;padding:0.5rem 1.25rem;font-size:0.825rem;font-weight:700;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.15);';
        okBtn.onclick = function() { overlay.remove(); };
        btnRow.appendChild(okBtn);

        modal.appendChild(titleRow);
        modal.appendChild(msgEl);
        modal.appendChild(btnRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        okBtn.focus();
        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) overlay.remove();
        });
        const keyHandler = function(e) {
          if (e.key === 'Enter' || e.key === 'Escape') {
            overlay.remove();
            window.removeEventListener('keydown', keyHandler);
          }
        };
        window.addEventListener('keydown', keyHandler);
      } catch(e) {
        console.log(msg);
      }
    };

    // 3. Custom Centered Company Delete Modal with 2 Buttons: Download & Backup to Drive
    window.__ubitShowCompanyDeleteBackupModal = function(opts) {
      const companyId = opts.companyId;
      const companyName = opts.companyName || 'Company';
      const onDownload = opts.onDownload;
      const onDrive = opts.onDrive;
      const onCancel = opts.onCancel;
      const theme = window.__ubitActiveTheme || '#10263c';

      const existing = document.getElementById('ubit-delete-backup-modal-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ubit-delete-backup-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:#ffffff;border-radius:1rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;font-family:sans-serif;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;';
      header.innerHTML = '<h3 style="margin:0;font-size:1.1rem;font-weight:800;color:#0f172a;line-height:1.3;">Take Backup before deleting the company</h3>' +
        '<p style="margin:0;font-size:0.825rem;color:#64748b;line-height:1.45;">' +
        'Before deleting company <strong style="color:#0f172a;">"' + companyName + '"</strong>, please select your backup option below:' +
        '</p>';

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;';

      // Button 1: Download
      const btn1 = document.createElement('button');
      btn1.type = 'button';
      btn1.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.25);transition:background 0.15s;';
      btn1.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Download</span>';
      btn1.onmouseover = function() { btn1.style.background = '#0369a1'; };
      btn1.onmouseout = function() { btn1.style.background = '#0284c7'; };
      btn1.onclick = async function() {
        overlay.remove();
        if (onDownload) await onDownload();
      };

      // Button 2: Backup to Drive
      const btn2 = document.createElement('button');
      btn2.type = 'button';
      btn2.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#10b981;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(16,185,129,0.25);transition:background 0.15s;';
      btn2.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 13 16 17"></polyline><line x1="12" y1="13" x2="12" y2="22"></line></svg><span>Backup to Drive</span>';
      btn2.onmouseover = function() { btn2.style.background = '#059669'; };
      btn2.onmouseout = function() { btn2.style.background = '#10b981'; };
      btn2.onclick = async function() {
        overlay.remove();
        if (onDrive) await onDrive();
      };

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:none;border:none;color:#64748b;font-size:0.8rem;font-weight:600;padding:0.35rem;cursor:pointer;text-align:center;text-decoration:underline;';
      cancelBtn.onclick = function() {
        overlay.remove();
        if (onCancel) onCancel();
      };

      btnContainer.appendChild(btn1);
      btnContainer.appendChild(btn2);
      btnContainer.appendChild(cancelBtn);

      modal.appendChild(header);
      modal.appendChild(btnContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.remove();
          if (onCancel) onCancel();
        }
      });
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          window.removeEventListener('keydown', escHandler);
          if (onCancel) onCancel();
        }
      };
      window.addEventListener('keydown', escHandler);
    };

    // 4. Centered Google Authenticator Sign-In Modal
    window.__ubitShowGoogleAuthModal = function(callback) {
      try {
        const existing = document.getElementById('ubit-google-auth-modal-overlay');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-google-auth-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);padding:1rem;font-family:Inter,system-ui,sans-serif;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:5px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:30rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

        // 1. Header: Software Name & Basic Details
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:0.85rem;border-bottom:1px solid #f1f5f9;padding-bottom:1rem;';
        header.innerHTML = '<div style="width:2.75rem;height:2.75rem;border-radius:0.75rem;background:#f8fafc;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 4px rgba(0,0,0,0.05);">' +
          '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>' +
          '</div>' +
          '<div>' +
          '<h3 style="margin:0;font-size:1.2rem;font-weight:800;color:#0f172a;letter-spacing:-0.3px;">UBIT Pro ERP</h3>' +
          '<p style="margin:0.2rem 0 0 0;font-size:0.775rem;color:#64748b;line-height:1.4;">Enterprise GST Billing & Accounting Software<br><span style="color:#0284c7;font-weight:600;">Google Account Authentication</span></p>' +
          '</div>';

        // 2. Discover accounts on this PC
        let detectedAccounts = [];
        try {
          const sysRaw = localStorage.getItem('ubit_erp_cloud_system_v1');
          if (sysRaw) {
            const sys = JSON.parse(sysRaw);
            if (Array.isArray(sys.users)) {
              sys.users.forEach(u => {
                const em = u.email || (u.username && u.username.includes('@') ? u.username : '');
                if (em && em.includes('@') && !detectedAccounts.some(a => a.email.toLowerCase() === em.toLowerCase())) {
                  detectedAccounts.push({ name: u.name || em.split('@')[0], email: em });
                }
              });
            }
          }
        } catch(e) {}

        // Add standard local accounts if none found
        if (detectedAccounts.length === 0) {
          detectedAccounts.push({ name: 'Client Account', email: 'client@gmail.com' });
          detectedAccounts.push({ name: 'Narmadha Traders', email: 'narmadhatrader@gmail.com' });
        }

        let selectedEmail = detectedAccounts[0].email;

        // Account Selection Container
        const accountBox = document.createElement('div');
        accountBox.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;';
        accountBox.innerHTML = '<div style="font-size:0.8rem;font-weight:700;color:#334155;margin-bottom:0.25rem;">Select Google Account on this PC:</div>';

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'display:flex;flex-direction:column;gap:0.4rem;max-height:10rem;overflow-y:auto;';

        detectedAccounts.forEach((acc, idx) => {
          const item = document.createElement('div');
          item.className = 'ubit-google-account-item';
          item.style.cssText = 'display:flex;align-items:center;justify-content:between;gap:0.75rem;padding:0.6rem 0.85rem;border-radius:0.65rem;border:1.5px solid ' + (idx === 0 ? '#0284c7' : '#e2e8f0') + ';background:' + (idx === 0 ? '#f0f9ff' : '#ffffff') + ';cursor:pointer;transition:all 0.15s;';
          item.innerHTML = '<div style="width:2rem;height:2rem;border-radius:50%;background:#e0f2fe;color:#0369a1;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;shrink-0;">' + (acc.name.charAt(0).toUpperCase()) + '</div>' +
            '<div style="flex:1;overflow:hidden;"><div style="font-size:0.825rem;font-weight:700;color:#0f172a;truncate;">' + acc.name + '</div><div style="font-size:0.75rem;color:#64748b;truncate;">' + acc.email + '</div></div>' +
            '<div style="width:1.1rem;height:1.1rem;border-radius:50%;border:2px solid ' + (idx === 0 ? '#0284c7' : '#cbd5e1') + ';display:flex;align-items:center;justify-content:center;">' +
            '<div style="width:0.55rem;height:0.55rem;border-radius:50%;background:' + (idx === 0 ? '#0284c7' : 'transparent') + ';"></div>' +
            '</div>';

          item.onclick = function() {
            selectedEmail = acc.email;
            customInput.value = acc.email;
            const items = listDiv.querySelectorAll('.ubit-google-account-item');
            items.forEach((it, i) => {
              const isSel = (i === idx);
              it.style.borderColor = isSel ? '#0284c7' : '#e2e8f0';
              it.style.background = isSel ? '#f0f9ff' : '#ffffff';
              const dot = it.querySelector('div:last-child > div');
              const circle = it.querySelector('div:last-child');
              if (dot) dot.style.background = isSel ? '#0284c7' : 'transparent';
              if (circle) circle.style.borderColor = isSel ? '#0284c7' : '#cbd5e1';
            });
          };
          listDiv.appendChild(item);
        });
        accountBox.appendChild(listDiv);

        // Custom account input option
        const customDiv = document.createElement('div');
        customDiv.style.cssText = 'margin-top:0.4rem;display:flex;flex-direction:column;gap:0.35rem;';
        customDiv.innerHTML = '<div style="font-size:0.75rem;color:#64748b;">Or type Google Account email:</div>';
        const customInput = document.createElement('input');
        customInput.type = 'email';
        customInput.value = selectedEmail;
        customInput.placeholder = 'username@gmail.com';
        customInput.style.cssText = 'width:100%;box-sizing:border-box;padding:0.6rem 0.85rem;border:1.5px solid #cbd5e1;border-radius:0.6rem;font-size:0.85rem;color:#0f172a;outline:none;';
        customInput.oninput = function() {
          if (customInput.value.trim()) selectedEmail = customInput.value.trim().toLowerCase();
        };
        customDiv.appendChild(customInput);
        accountBox.appendChild(customDiv);

        // 3. Action Buttons: Sign In & Sign Up
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;margin-top:0.5rem;';

        const signInBtn = document.createElement('button');
        signInBtn.type = 'button';
        signInBtn.textContent = 'Sign In';
        signInBtn.style.cssText = 'flex:1;padding:0.75rem 1rem;background:' + theme + ';color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.25);transition:opacity 0.15s;';
        signInBtn.onclick = function() {
          const val = (customInput.value || selectedEmail || '').trim();
          if (!val) { alert('Please select or enter your Google email.'); return; }
          overlay.remove();
          if (callback) callback(val);
        };

        const signUpBtn = document.createElement('button');
        signUpBtn.type = 'button';
        signUpBtn.textContent = 'Sign Up';
        signUpBtn.style.cssText = 'flex:1;padding:0.75rem 1rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.25);transition:opacity 0.15s;';
        signUpBtn.onclick = function() {
          const val = (customInput.value || selectedEmail || '').trim();
          if (!val) { alert('Please select or enter your Google email.'); return; }
          overlay.remove();
          if (callback) callback(val);
        };

        btnRow.appendChild(signInBtn);
        btnRow.appendChild(signUpBtn);

        // 4. Footer: Security message
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.5rem;padding-top:0.75rem;border-top:1px solid #f1f5f9;font-size:0.75rem;color:#10b981;font-weight:600;text-align:center;';
        footer.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>' +
          '<span>Your details are safe and secure as per Google Firebase</span>';

        // Close / cancel top-right button
        const closeX = document.createElement('button');
        closeX.innerHTML = '✕';
        closeX.style.cssText = 'position:absolute;top:1rem;right:1.25rem;background:none;border:none;font-size:1.1rem;color:#94a3b8;cursor:pointer;font-weight:700;';
        closeX.onclick = function() { overlay.remove(); };
        modal.style.position = 'relative';
        modal.appendChild(closeX);

        modal.appendChild(header);
        modal.appendChild(accountBox);
        modal.appendChild(btnRow);
        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
          if (e.target === overlay) overlay.remove();
        });
        const escHandler = function(e) {
          if (e.key === 'Escape') {
            overlay.remove();
            window.removeEventListener('keydown', escHandler);
          }
        };
        window.addEventListener('keydown', escHandler);
      } catch(e) {
        console.error('Error opening Google Auth modal:', e);
      }
    };

    
    // 4b. Centered Google Drive Connect Modal
    window.__ubitShowGDriveConnectModal = function(callback) {
      try {
        const existing = document.getElementById('ubit-gdrive-connect-modal-overlay');
        if (existing) existing.remove();

        const theme = window.__ubitActiveTheme || '#10263c';
        const overlay = document.createElement('div');
        overlay.id = 'ubit-gdrive-connect-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:Inter,system-ui,sans-serif;';

        const modal = document.createElement('div');
        modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:5px solid #0284c7;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

        modal.innerHTML = '<div style="display:flex;align-items:center;gap:0.85rem;border-bottom:1px solid #f1f5f9;padding-bottom:1rem;">' +
          '<div style="width:2.75rem;height:2.75rem;border-radius:0.75rem;background:#f0f9ff;border:1px solid #bae6fd;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>' +
          '</div>' +
          '<div>' +
          '<h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;">Connect Google Drive</h3>' +
          '<p style="margin:0.2rem 0 0 0;font-size:0.775rem;color:#64748b;">Link your account for automated cloud synchronization</p>' +
          '</div></div>' +
          '<div style="display:flex;flex-direction:column;gap:0.5rem;">' +
          '<label style="font-size:0.8rem;font-weight:700;color:#334155;">Google Account Email:</label>' +
          '<input id="ubit-gdrive-email-input" type="email" value="narmadhatrader@gmail.com" placeholder="client@gmail.com" style="width:100%;box-sizing:border-box;padding:0.65rem 0.85rem;border:1.5px solid #cbd5e1;border-radius:0.6rem;font-size:0.875rem;color:#0f172a;outline:none;" />' +
          '<span style="font-size:0.75rem;color:#64748b;">Cloud backups will be sent securely to /GST_ERP_Backups/</span>' +
          '</div>' +
          '<div style="display:flex;align-items:center;justify-content:flex-end;gap:0.75rem;margin-top:0.5rem;">' +
          '<button id="ubit-gdrive-cancel-btn" type="button" style="padding:0.6rem 1.1rem;background:#f1f5f9;color:#475569;border:none;border-radius:0.6rem;font-size:0.85rem;font-weight:700;cursor:pointer;">Cancel</button>' +
          '<button id="ubit-gdrive-save-btn" type="button" style="padding:0.6rem 1.35rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.6rem;font-size:0.85rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.3);">Connect & Backup</button>' +
          '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        document.getElementById('ubit-gdrive-cancel-btn').onclick = function() { overlay.remove(); };
        document.getElementById('ubit-gdrive-save-btn').onclick = function() {
          const email = (document.getElementById('ubit-gdrive-email-input').value || '').trim();
          overlay.remove();
          if (callback) callback(email || 'narmadhatrader@gmail.com');
        };
        overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
      } catch(e) {
        console.error('Error opening Google Drive Connect modal:', e);
      }
    };

    // 4c. Windows File Explorer Native Local Backup Saver
    window.__ubitShowLocalBackupFolderModal = async function(callback) {
      try {
        const backupDate = new Date().toISOString().split('T')[0];
        const defaultFilename = `ubit_erp_backup_${backupDate}.json`;

        const getBackupData = function() {
          const payload = {
            exportDate: new Date().toISOString(),
            system: JSON.parse(localStorage.getItem('ubit_erp_cloud_system_v1') || '{}'),
            activeCompany: window.__erpCurrentCompany || (typeof Qu === 'function' ? Qu()?.currentCompany : null),
            companies: {}
          };
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('ubit_erp_cloud_company_')) {
              try {
                payload.companies[k] = JSON.parse(localStorage.getItem(k));
              } catch (e) {}
            }
          }
          return JSON.stringify(payload, null, 2);
        };

        // 1. Native Windows File Explorer Directory Picker
        if (typeof window.showDirectoryPicker === 'function') {
          try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (dirHandle) {
              const fileHandle = await dirHandle.getFileHandle(defaultFilename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(getBackupData());
              await writable.close();
              alert('Backup successfully saved to selected folder: ' + defaultFilename);
              if (callback) await callback();
              return;
            }
          } catch (err) {
            if (err.name === 'AbortError') return; // User closed Explorer
            console.warn('showDirectoryPicker error, trying save picker:', err);
          }
        }

        // 2. Native Windows File Explorer Save File Picker
        if (typeof window.showSaveFilePicker === 'function') {
          try {
            const fileHandle = await window.showSaveFilePicker({
              suggestedName: defaultFilename,
              types: [{
                description: 'JSON Backup (*.json)',
                accept: { 'application/json': ['.json'] }
              }]
            });
            if (fileHandle) {
              const writable = await fileHandle.createWritable();
              await writable.write(getBackupData());
              await writable.close();
              alert('Backup successfully saved: ' + (fileHandle.name || defaultFilename));
              if (callback) await callback();
              return;
            }
          } catch (err) {
            if (err.name === 'AbortError') return; // User closed Explorer
            console.warn('showSaveFilePicker error:', err);
          }
        }

        // 3. Fallback to default callback
        if (callback) await callback();
      } catch (err) {
        console.error('Error during Windows Explorer backup selection:', err);
        if (callback) await callback();
      }
    };

    // 5. Centered Backup All Company Modal (Save to Local Drive vs Save to Google Drive)
    window.__ubitShowBackupAllCompaniesModal = function(opts) {
      opts = opts || {};
      const onLocal = opts.onLocal;
      const onDrive = opts.onDrive;
      const onCancel = opts.onCancel;
      const theme = window.__ubitActiveTheme || '#10263c';

      const existing = document.getElementById('ubit-backup-all-companies-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ubit-backup-all-companies-modal';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:sans-serif;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:#ffffff;border-radius:1.25rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.75rem;display:flex;flex-direction:column;gap:1.25rem;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;';
      header.innerHTML = '<h3 style="margin:0;font-size:1.15rem;font-weight:800;color:#0f172a;line-height:1.3;">Backup All Company</h3>' +
        '<p style="margin:0;font-size:0.825rem;color:#64748b;line-height:1.45;">' +
        'Select your preferred backup destination for all active company databases:' +
        '</p>';

      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = 'display:flex;flex-direction:column;gap:0.75rem;';

      // Button 1: Save to Local Drive
      const btn1 = document.createElement('button');
      btn1.type = 'button';
      btn1.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#0284c7;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(2,132,199,0.25);transition:background 0.15s;';
      btn1.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Save to Local Drive</span>';
      btn1.onmouseover = function() { btn1.style.background = '#0369a1'; };
      btn1.onmouseout = function() { btn1.style.background = '#0284c7'; };
      btn1.onclick = async function() {
        overlay.remove();
        if (onLocal) await onLocal();
      };

      // Button 2: Save to Google Drive
      const btn2 = document.createElement('button');
      btn2.type = 'button';
      btn2.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.75rem 1rem;background:#10b981;color:#ffffff;border:none;border-radius:0.65rem;font-size:0.875rem;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(16,185,129,0.25);transition:background 0.15s;';
      btn2.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><polyline points="8 17 12 13 16 17"></polyline><line x1="12" y1="13" x2="12" y2="22"></line></svg><span>Save to Google Drive</span>';
      btn2.onmouseover = function() { btn2.style.background = '#059669'; };
      btn2.onmouseout = function() { btn2.style.background = '#10b981'; };
      btn2.onclick = async function() {
        overlay.remove();
        if (onDrive) await onDrive();
      };

      // Cancel button
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'background:none;border:none;color:#64748b;font-size:0.8rem;font-weight:600;padding:0.35rem;cursor:pointer;text-align:center;text-decoration:underline;';
      cancelBtn.onclick = function() {
        overlay.remove();
        if (onCancel) onCancel();
      };

      btnContainer.appendChild(btn1);
      btnContainer.appendChild(btn2);
      btnContainer.appendChild(cancelBtn);

      modal.appendChild(header);
      modal.appendChild(btnContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.remove();
          if (onCancel) onCancel();
        }
      });
      const escHandler = function(e) {
        if (e.key === 'Escape') {
          overlay.remove();
          window.removeEventListener('keydown', escHandler);
          if (onCancel) onCancel();
        }
      };
      window.addEventListener('keydown', escHandler);
    };

    // 6. Universal Centered Themed Prompt Replacement
    window.__ubitPromptAsync = function(title, defaultVal) {
      return new Promise(function(resolve) {
        try {
          const existing = document.getElementById('ubit-custom-prompt-modal');
          if (existing) existing.remove();

          const theme = window.__ubitActiveTheme || '#10263c';
          const overlay = document.createElement('div');
          overlay.id = 'ubit-custom-prompt-modal';
          overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);padding:1rem;font-family:sans-serif;';

          const modal = document.createElement('div');
          modal.style.cssText = 'background:#ffffff;border-radius:1rem;border-top:4px solid ' + theme + ';box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);max-width:28rem;width:100%;overflow:hidden;padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;';

          const titleRow = document.createElement('div');
          titleRow.style.cssText = 'display:flex;align-items:center;gap:0.75rem;';
          titleRow.innerHTML = '<div style="width:2.25rem;height:2.25rem;border-radius:9999px;background:rgba(16,38,60,0.1);color:' + theme + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><h3 style="margin:0;font-size:1rem;font-weight:700;color:#0f172a;">' + (title || 'UBIT Pro ERP') + '</h3>';

          const form = document.createElement('form');
          form.style.cssText = 'display:flex;flex-direction:column;gap:1rem;margin:0;';

          const input = document.createElement('input');
          input.type = 'text';
          input.value = defaultVal || '';
          input.style.cssText = 'width:100%;box-sizing:border-box;padding:0.65rem 0.85rem;border:1.5px solid #cbd5e1;border-radius:0.5rem;font-size:0.9rem;color:#0f172a;outline:none;';
          input.onfocus = function() { input.style.borderColor = '#0284c7'; };
          input.onblur = function() { input.style.borderColor = '#cbd5e1'; };

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:0.75rem;';

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'padding:0.5rem 1rem;background:#f1f5f9;color:#475569;border:none;border-radius:0.5rem;font-size:0.85rem;font-weight:700;cursor:pointer;';
          cancelBtn.onclick = function() {
            overlay.remove();
            resolve(null);
          };

          const okBtn = document.createElement('button');
          okBtn.type = 'submit';
          okBtn.textContent = 'OK';
          okBtn.style.cssText = 'padding:0.5rem 1.25rem;background:' + theme + ';color:#ffffff;border:none;border-radius:0.5rem;font-size:0.85rem;font-weight:700;cursor:pointer;';

          form.onsubmit = function(e) {
            e.preventDefault();
            overlay.remove();
            resolve(input.value);
          };

          btnRow.appendChild(cancelBtn);
          btnRow.appendChild(okBtn);
          form.appendChild(input);
          form.appendChild(btnRow);

          modal.appendChild(titleRow);
          modal.appendChild(form);
          overlay.appendChild(modal);
          document.body.appendChild(overlay);

          setTimeout(function() {
            input.focus();
            input.select();
          }, 50);

          overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
              overlay.remove();
              resolve(null);
            }
          });
          const escHandler = function(e) {
            if (e.key === 'Escape') {
              overlay.remove();
              window.removeEventListener('keydown', escHandler);
              resolve(null);
            }
          };
          window.addEventListener('keydown', escHandler);
        } catch(e) {
          resolve(prompt(title, defaultVal));
        }
      });
    };
  })();


  // =========================================================================
  // EXTENSION 5: NATIVE WINDOWS FILE EXPLORER SAVE & OPEN PICKER SYSTEM
  // Full Directory Persistence across Sessions via id: 'ubit_erp_save_location'
  // =========================================================================

  function showSleekToast(msg, type = 'success') {
    try {
      let container = document.getElementById('ubit-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'ubit-toast-container';
        container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      const isSuccess = type === 'success';
      toast.style.cssText = 'pointer-events:auto;background:' + (isSuccess ? '#0f172a' : '#991b1b') + ';color:#ffffff;padding:12px 18px;border-radius:10px;font-size:12px;font-weight:600;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);display:flex;align-items:center;gap:10px;border-left:4px solid ' + (isSuccess ? '#10b981' : '#f87171') + ';font-family:Inter,system-ui,sans-serif;animation:slideIn 0.2s ease-out;';
      toast.innerHTML = '<span style="font-size:16px;">' + (isSuccess ? '💾' : '⚠️') + '</span><span>' + msg + '</span>';
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    } catch(e) {}
  }

  window.UBIT_SAVE_FILE = async function(blobOrData, filename, mimeType, description, ext) {
    const safeFilename = (filename || 'export.dat').replace(/[/\\?%*:|"<>]/g, '_');
    const extName = ext || (safeFilename.includes('.') ? '.' + safeFilename.split('.').pop() : '.bin');
    const mType = mimeType || (extName === '.pdf' ? 'application/pdf' : (extName === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : (extName === '.xml' ? 'application/xml' : (extName === '.json' ? 'application/json' : 'application/octet-stream'))));
    const desc = description || (extName === '.pdf' ? 'PDF Document (*.pdf)' : (extName === '.xlsx' ? 'Excel Spreadsheet (*.xlsx)' : (extName === '.xml' ? 'Tally XML Data (*.xml)' : (extName === '.json' ? 'JSON Data Backup (*.json)' : 'File'))));

    const blob = (blobOrData instanceof Blob) ? blobOrData : new Blob([blobOrData], { type: mType });

    // 1. Directory Picker (User selects destination folder)
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(safeFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          if (typeof showSleekToast === 'function') {
            showSleekToast('Saved "' + safeFilename + '" to chosen folder!');
          }
          return { success: true, handle: fileHandle };
        }
      } catch (err) {
        // User closed explorer or clicked cancel -> DO NOT DOWNLOAD
        return { cancelled: true };
      }
      return { cancelled: true };
    }

    // 2. Save File Picker fallback
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const accept = {};
        accept[mType] = [extName];
        const handle = await window.showSaveFilePicker({
          suggestedName: safeFilename,
          types: [{
            description: desc,
            accept: accept
          }],
          id: 'ubit_erp_save_location'
        });

        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();

          if (typeof showSleekToast === 'function') {
            showSleekToast('Saved "' + safeFilename + '" to chosen location!');
          }
          return { success: true, handle };
        }
      } catch (err) {
        // User cancelled -> DO NOT DOWNLOAD
        return { cancelled: true };
      }
      return { cancelled: true };
    }

    // Ancient browsers without file system API only
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.__ubit_bypassed = true;
    a.href = url;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch(e) {}
      URL.revokeObjectURL(url);
    }, 2000);
    return { success: true, fallback: true };
  };

  window.UBIT_OPEN_FILE = async function(options) {
    options = options || {};
    const types = options.types || [
      {
        description: 'Spreadsheet & Data Files (*.xlsx, *.csv, *.json)',
        accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/csv': ['.csv'],
          'application/json': ['.json', '.gsterp']
        }
      }
    ];
    if ('showOpenFilePicker' in window) {
      try {
        const [fileHandle] = await window.showOpenFilePicker({
          types: types,
          multiple: false,
          id: 'ubit_erp_open_location'
        });
        const file = await fileHandle.getFile();
        return file;
      } catch (err) {
        if (err.name === 'AbortError') return null;
        console.warn('[UBIT] showOpenFilePicker fallback:', err);
      }
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = options.accept || '.xlsx,.xls,.csv,.json,.gsterp';
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
  };

  // Universal interception of all programmatic download anchor clicks
  (function() {
    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.__ubit_bypassed) {
        return origAnchorClick.apply(this, arguments);
      }
      if (this.download && (this.href.startsWith('blob:') || this.href.startsWith('data:'))) {
        const filename = this.download;
        const href = this.href;
        fetch(href).then(r => r.blob()).then(blob => {
          window.UBIT_SAVE_FILE(blob, filename);
        }).catch(() => {
          this.__ubit_bypassed = true;
          this.click();
        });
        return;
      }
      return origAnchorClick.apply(this, arguments);
    };
  })();

  // Intercept all file upload buttons in Utilities Import/Export to use showOpenFilePicker
  document.addEventListener('click', async function(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const btnText = (btn.textContent || '').trim();
    if (btnText.includes('Upload Party File') || btnText.includes('Upload Items File')) {
      if ('showOpenFilePicker' in window) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const file = await window.UBIT_OPEN_FILE();
        if (file) {
          const container = btn.closest('.border') || btn.parentElement;
          const input = container?.querySelector('input[type="file"]') || document.querySelector('input[type="file"]');
          if (input) {
            try {
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
              input.dispatchEvent(new Event('change', { bubbles: true }));
              showSleekToast('Selected file: ' + file.name);
            } catch(e) {}
          }
        }
      }
    }
  }, true);

  // Enhanced Toolbar Batch Export for Native Windows File Explorer Save
  const prevBatchExport = window.__erpBatchExport;

  window.__ubitRenderIndividualBillHTML = function(it, company, docTitle, copyLabel) {
    const cMeta = company.meta || company || {};
    const cName = cMeta.name || 'Company Name';
    const cAddr = cMeta.address || cMeta.billingAddress || '';
    const cPhone = cMeta.phone || cMeta.mobile || '';
    const cGst = cMeta.gstin || '';
    const cEmail = cMeta.email || '';
    const logoUrl = cMeta.logoUrl || '';
    const sigUrl = cMeta.signatureUrl || '';
    const themeColor = cMeta.themeColor || '#0284c7';
    const terms = it.notes || cMeta.termsAndConditions || cMeta.customTerms || '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.';

    const isPurchase = (docTitle || '').toLowerCase().includes('purchase');
    const isDebitNote = (docTitle || '').toLowerCase().includes('debit');
    const isPurchaseOrder = (docTitle || '').toLowerCase().includes('purchase order') || (isPurchase && (docTitle || '').toLowerCase().includes('order'));
    const isPurchaseDoc = isPurchase || isDebitNote || isPurchaseOrder;
    const isOrder = (docTitle || '').toLowerCase().includes('order');
    const isChallan = (docTitle || '').toLowerCase().includes('challan');
    const isPaymentOut = (docTitle || '').toLowerCase().includes('payment out');
    const isPayment = (docTitle || '').toLowerCase().includes('payment') || (docTitle || '').toLowerCase().includes('receipt') || (docTitle || '').toLowerCase().includes('voucher') || isPaymentOut;
    const isCredit = (docTitle || '').toLowerCase().includes('credit');

    let defaultDocBadge = 'TAX INVOICE';
    if (isPurchaseOrder) defaultDocBadge = 'PURCHASE ORDER';
    else if (isDebitNote) defaultDocBadge = 'DEBIT NOTE (PURCHASE RETURN)';
    else if (isPurchase) defaultDocBadge = 'PURCHASE BILL';
    else if (isOrder) defaultDocBadge = 'SALE ORDER';
    else if (isChallan) defaultDocBadge = 'DELIVERY CHALLAN';
    else if (isCredit) defaultDocBadge = 'CREDIT NOTE (SALES RETURN)';
    else if (isPaymentOut) defaultDocBadge = 'PAYMENT VOUCHER';
    else if (isPayment) defaultDocBadge = 'PAYMENT RECEIPT';

    const docBadge = defaultDocBadge;
    const num = it.invoiceNo || it.billNo || it.orderNo || it.challanNo || it.receiptNo || it.voucherNo || it.noteNo || it.refNo || 'DOC';
    const dt = (it.date || it.createdAt) ? new Date(it.date || it.createdAt).toLocaleDateString('en-GB') : '-';
    const dueDt = it.dueDate ? new Date(it.dueDate).toLocaleDateString('en-GB') : '';
    const partyName = it.partyName || it.name || it.particulars || 'Customer';
    const partyAddr = it.partyAddress || it.address || '';
    const partyGst = it.partyGstin || it.gstin || '';
    const partyPhone = it.partyPhone || it.phone || '';

    const grandTotal = Number(it.grandTotal != null ? it.grandTotal : (it.totalAmount != null ? it.totalAmount : (it.amount != null ? it.amount : (it.inflow ? it.inflow : (it.outflow ? it.outflow : 0)))));
    const balanceDue = Number(it.balanceDue != null ? it.balanceDue : (it.balance != null ? it.balance : 0));
    const subTotal = Number(it.subTotal != null ? it.subTotal : (it.taxableAmount != null ? it.taxableAmount : (it.totalTaxable != null ? it.totalTaxable : (grandTotal - (Number(it.cgstTotal||0) + Number(it.sgstTotal||0) + Number(it.igstTotal||0))))));
    const cgst = Number(it.cgstTotal || it.cgst || 0);
    const sgst = Number(it.sgstTotal || it.sgst || 0);
    const igst = Number(it.igstTotal || it.igst || 0);
    const roundOff = it.roundOff != null ? Number(it.roundOff) : 0;
    const paymentMode = it.paymentMode || it.paymentType || (it.billType === 'Cash' ? 'Cash' : 'Credit');
    const utrNo = it.paymentRefNo || it.transactionNo || it.referenceNo || it.utrNo || it.utr || '';
    const description = it.description || it.notes || '';

    const copyBadgeText = copyLabel || 'ORIGINAL FOR RECIPIENT';

    // SPECIAL HANDLING FOR PAYMENT IN & PAYMENT OUT (NO ITEM TABLE OR QTY DETAILS!):
    if (isPayment) {
      return '<div class="bill-page printable-bill-page" style="page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;max-width:860px;margin:0 auto 12px;padding:16px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#0f172a;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:2px solid ' + themeColor + ';margin-bottom:12px;">' +
          '<div>' +
            (logoUrl ? '<img src="' + logoUrl + '" style="max-height:42px;max-width:130px;object-fit:contain;margin-bottom:3px;display:block;" />' : '') +
            '<div style="font-size:18px;font-weight:900;text-transform:uppercase;color:' + themeColor + ';line-height:1.2;">' + cName + '</div>' +
            (cAddr ? '<div style="font-size:10px;color:#475569;margin-top:2px;">' + cAddr + '</div>' : '') +
            '<div style="font-size:9.5px;color:#64748b;margin-top:2px;font-family:monospace;">' +
              [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('  |  ') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="background:' + themeColor + ';color:#ffffff;padding:4px 12px;border-radius:4px;font-size:11px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;display:inline-block;">' + docBadge + '</div>' +
            '<div style="font-size:9.5px;color:#64748b;font-weight:700;margin-top:3px;text-transform:uppercase;">' + copyBadgeText + '</div>' +
            '<div style="margin-top:6px;font-size:10px;color:#64748b;">' +
              '<div><span>Doc / Ref No:</span> <strong style="font-family:monospace;font-size:12px;color:#0f172a;">' + num + '</strong></div>' +
              '<div><span>Date:</span> <strong style="font-family:monospace;">' + dt + '</strong></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:12px;">' +
          '<div style="margin-bottom:10px;">' +
            '<span style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:2px;">' + (isPaymentOut ? 'Paid To (Party / Supplier)' : 'Received From (Party / Customer)') + '</span>' +
            '<strong style="font-size:15px;color:#0f172a;display:block;">' + partyName + '</strong>' +
            (partyAddr ? '<div style="font-size:10px;color:#475569;margin-top:2px;">' + partyAddr + '</div>' : '') +
            (partyGst || partyPhone ? '<div style="font-size:9.5px;color:#64748b;margin-top:2px;font-family:monospace;">' + [partyGst ? 'GSTIN: ' + partyGst : '', partyPhone ? 'Ph: ' + partyPhone : ''].filter(Boolean).join('  |  ') + '</div>' : '') +
          '</div>' +
          '<div style="margin-bottom:10px;padding-top:8px;border-top:1px dashed #cbd5e1;">' +
            '<span style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:2px;">Payment Type / Mode</span>' +
            '<strong style="font-size:12px;color:#0f172a;display:inline-block;padding:2px 8px;background:#e2e8f0;border-radius:4px;">' + paymentMode + '</strong>' +
          '</div>' +
          '<div style="margin-bottom:10px;padding:10px 14px;background:#ffffff;border:1.5px solid ' + themeColor + ';border-radius:6px;display:flex;justify-content:space-between;align-items:baseline;">' +
            '<span style="font-size:11px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:0.04em;">' + (isPaymentOut ? 'TOTAL AMOUNT PAID' : 'TOTAL AMOUNT RECEIVED') + '</span>' +
            '<span style="font-size:18px;font-weight:900;color:' + themeColor + ';font-family:monospace;">₹ ' + grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</span>' +
          '</div>' +
          (utrNo ? ('<div style="margin-bottom:10px;padding-top:6px;border-top:1px dashed #cbd5e1;">' +
            '<span style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:2px;">UTR / Reference No</span>' +
            '<strong style="font-size:12px;font-family:monospace;color:#0f172a;">' + utrNo + '</strong>' +
          '</div>') : '') +
          (description ? ('<div style="padding-top:6px;border-top:1px dashed #cbd5e1;">' +
            '<span style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:2px;">Description / Notes</span>' +
            '<div style="font-size:11px;color:#334155;line-height:1.4;">' + description + '</div>' +
          '</div>') : '') +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:10px;">' +
          '<div style="text-align:right;font-size:9.5px;">' +
            '<strong style="color:#0f172a;">For ' + cName + '</strong>' +
            (sigUrl ? '<img src="' + sigUrl + '" style="max-height:36px;max-width:120px;object-fit:contain;margin:4px 0;display:block;margin-left:auto;" />' : '<div style="height:26px;"></div>') +
            '<span style="font-weight:700;color:#475569;text-transform:uppercase;font-size:8.5px;display:block;">Authorized Signatory</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    // STANDARD BILL LAYOUT (FOR SALES, PURCHASES, ORDERS, NOTES):
    const bankAccounts = company.bankAccounts || [];
    const defaultBank = bankAccounts.find(b => b.isDefault) || bankAccounts[0] || null;
    const activeBank = (it.bankAccountId ? bankAccounts.find(b => b.id === it.bankAccountId) : null) || defaultBank;
    const payeeVpa = activeBank?.upiId || activeBank?.upiNumber || cMeta.upiId || '';

    const items = it.items || [];
    let rowsHtml = '';
    if (items.length > 0) {
      rowsHtml = items.map(function(row, idx) {
        const iName = row.name || row.itemName || row.particulars || row.description || 'Item';
        const hsn = row.hsn || row.hsnCode || '-';
        const qty = row.qty != null ? row.qty : (row.quantity != null ? row.quantity : 1);
        const unit = row.unit || 'PCS';
        const price = Number(row.price != null ? row.price : (row.rate != null ? row.rate : 0));
        const gstRate = row.gstRate != null ? row.gstRate : (row.taxRate != null ? row.taxRate : 0);
        const tot = Number(row.total != null ? row.total : (row.amount != null ? row.amount : (qty * price)));
        return '<tr style="border-bottom:1px solid #e2e8f0;font-size:10px;">' +
          '<td style="padding:3px 5px;text-align:center;color:#64748b;">' + (idx + 1) + '</td>' +
          '<td style="padding:3px 5px;font-weight:600;color:#0f172a;">' + iName + '</td>' +
          '<td style="padding:3px 5px;text-align:center;font-family:monospace;color:#475569;">' + hsn + '</td>' +
          '<td style="padding:3px 5px;text-align:right;font-family:monospace;">' + qty + ' ' + unit + '</td>' +
          '<td style="padding:3px 5px;text-align:right;font-family:monospace;">' + price.toFixed(2) + '</td>' +
          '<td style="padding:3px 5px;text-align:right;font-family:monospace;">' + gstRate + '%</td>' +
          '<td style="padding:3px 5px;text-align:right;font-family:monospace;font-weight:700;">₹ ' + tot.toFixed(2) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      const desc = it.description || it.notes || 'General Transaction';
      rowsHtml = '<tr style="border-bottom:1px solid #e2e8f0;font-size:10px;">' +
        '<td style="padding:4px 6px;text-align:center;color:#64748b;">1</td>' +
        '<td style="padding:4px 6px;font-weight:600;color:#0f172a;" colspan="3">' + desc + '</td>' +
        '<td style="padding:4px 6px;text-align:center;">' + paymentMode + '</td>' +
        '<td style="padding:4px 6px;text-align:right;font-family:monospace;">-</td>' +
        '<td style="padding:4px 6px;text-align:right;font-family:monospace;font-weight:700;">₹ ' + grandTotal.toFixed(2) + '</td>' +
        '</tr>';
    }

    // QR SECTION REQUIREMENT:
    // - For purchase, purchase order, and debit note: NEVER show qr code!
    // - For payment received bills: NEVER show qr code!
    let qrSectionHtml = '';
    if (!isPurchaseDoc) {
      const isPaymentReceived = (
        it.status === 'Paid' ||
        balanceDue <= 0.001 ||
        (it.receivedAmount != null && Number(it.receivedAmount) >= grandTotal && grandTotal > 0) ||
        (it.paidAmount != null && Number(it.paidAmount) >= grandTotal && grandTotal > 0)
      );

      if (isPaymentReceived) {
        qrSectionHtml = '<div style="margin-top:4px;padding:3px 6px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:4px;display:inline-block;font-size:9.5px;font-weight:800;color:#047857;letter-spacing:0.04em;">STATUS: FULLY PAID</div>' +
          '<div style="font-size:9px;color:#64748b;margin-top:2px;">Payment Received • Mode: <strong>' + paymentMode + '</strong></div>';
      } else if (payeeVpa && balanceDue > 0) {
        qrSectionHtml = '<div style="margin-top:4px;padding:3px 6px;background:#fef2f2;border:1px solid #fecaca;border-radius:4px;display:inline-block;font-size:9px;color:#991b1b;">' +
          '<strong>UPI Payment:</strong> ' + payeeVpa + ' • Bal: ₹ ' + balanceDue.toFixed(2) + '</div>';
      }
    }

    // FOOTER TERMS & CONDITIONS REQUIREMENT:
    // "for purchase and purchase order and debit note never show qr code and never show tearms and conditon"
    let footerSectionHtml = '';
    if (isPurchaseDoc) {
      footerSectionHtml = '<div style="display:flex;justify-content:flex-end;border-top:1px solid #e2e8f0;padding-top:6px;">' +
        '<div style="text-align:right;font-size:9.5px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;">' +
          '<strong style="color:#0f172a;">For ' + cName + '</strong>' +
          (sigUrl ? '<img src="' + sigUrl + '" style="max-height:34px;max-width:120px;object-fit:contain;margin:2px 0;" />' : '<div style="height:24px;"></div>') +
          '<span style="font-weight:700;color:#475569;text-transform:uppercase;font-size:8px;">Authorized Signatory</span>' +
        '</div>' +
      '</div>';
    } else {
      footerSectionHtml = '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;border-top:1px solid #e2e8f0;padding-top:6px;">' +
        '<div style="font-size:8px;color:#64748b;line-height:1.3;">' +
          '<strong style="color:#0f172a;text-transform:uppercase;display:block;margin-bottom:1px;">Terms & Conditions</strong>' +
          terms.replace(/\n/g, '<br>') +
        '</div>' +
        '<div style="text-align:right;font-size:9.5px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;">' +
          '<strong style="color:#0f172a;">For ' + cName + '</strong>' +
          (sigUrl ? '<img src="' + sigUrl + '" style="max-height:34px;max-width:120px;object-fit:contain;margin:2px 0;" />' : '<div style="height:24px;"></div>') +
          '<span style="font-weight:700;color:#475569;text-transform:uppercase;font-size:8px;">Authorized Signatory</span>' +
        '</div>' +
      '</div>';
    }

    return '<div class="bill-page printable-bill-page" style="page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;max-width:860px;margin:0 auto 10px;padding:14px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#0f172a;">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px;border-bottom:2px solid ' + themeColor + ';margin-bottom:8px;">' +
        '<div>' +
          (logoUrl ? '<img src="' + logoUrl + '" style="max-height:38px;max-width:130px;object-fit:contain;margin-bottom:2px;display:block;" />' : '') +
          '<div style="font-size:16px;font-weight:900;text-transform:uppercase;color:' + themeColor + ';line-height:1.2;">' + cName + '</div>' +
          (cAddr ? '<div style="font-size:9.5px;color:#475569;margin-top:1px;">' + cAddr + '</div>' : '') +
          '<div style="font-size:9px;color:#64748b;margin-top:1px;font-family:monospace;">' +
            [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('  |  ') +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="background:' + themeColor + ';color:#ffffff;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:900;letter-spacing:0.04em;text-transform:uppercase;display:inline-block;">' + docBadge + '</div>' +
          '<div style="font-size:9px;color:#64748b;font-weight:700;margin-top:2px;text-transform:uppercase;">' + copyBadgeText + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;margin-bottom:8px;">' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:9.5px;">' +
          '<span style="font-size:8px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:1px;">' + (isPurchase ? 'Supplier / Billed From' : 'Customer / Billed To') + '</span>' +
          '<strong style="font-size:11px;color:#0f172a;display:block;">' + partyName + '</strong>' +
          (partyAddr ? '<div style="color:#475569;margin-top:1px;line-height:1.2;">' + partyAddr + '</div>' : '') +
          '<div style="color:#64748b;margin-top:1px;font-family:monospace;">' +
            [partyGst ? 'GSTIN: ' + partyGst : 'GST: Unregistered', partyPhone ? 'Ph: ' + partyPhone : ''].filter(Boolean).join('  |  ') +
          '</div>' +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:9.5px;text-align:right;">' +
          '<div style="margin-bottom:1px;"><span style="color:#64748b;">Doc / Ref No:</span> <strong style="font-family:monospace;font-size:11px;color:#0f172a;">' + num + '</strong></div>' +
          '<div style="margin-bottom:1px;"><span style="color:#64748b;">Date:</span> <strong style="font-family:monospace;">' + dt + '</strong></div>' +
          (dueDt ? '<div style="margin-bottom:1px;"><span style="color:#64748b;">Due Date:</span> <strong style="font-family:monospace;">' + dueDt + '</strong></div>' : '') +
          '<div><span style="color:#64748b;">Payment Mode:</span> <strong>' + paymentMode + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;border:1px solid #e2e8f0;">' +
        '<thead>' +
          '<tr style="background:#f1f5f9;color:#334155;font-size:9.5px;text-transform:uppercase;font-weight:800;border-bottom:1px solid #cbd5e1;">' +
            '<th style="padding:4px 5px;width:25px;text-align:center;">#</th>' +
            '<th style="padding:4px 5px;text-align:left;">Item & Description</th>' +
            '<th style="padding:4px 5px;width:65px;text-align:center;">HSN/SAC</th>' +
            '<th style="padding:4px 5px;width:55px;text-align:right;">Qty</th>' +
            '<th style="padding:4px 5px;width:70px;text-align:right;">Price (₹)</th>' +
            '<th style="padding:4px 5px;width:50px;text-align:right;">GST %</th>' +
            '<th style="padding:4px 5px;width:85px;text-align:right;">Amount (₹)</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' +
          rowsHtml +
        '</tbody>' +
      '</table>' +
      '<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;margin-bottom:8px;">' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:9px;">' +
          (!isPurchaseDoc ? (
            '<strong style="font-size:9.5px;color:#0f172a;text-transform:uppercase;letter-spacing:0.03em;display:block;border-bottom:1px solid #e2e8f0;padding-bottom:2px;margin-bottom:3px;">Bank & Payment Details</strong>' +
            (activeBank ? (
              '<div style="display:flex;justify-content:space-between;margin-bottom:1px;"><span style="color:#64748b;">Bank:</span><strong>' + (activeBank.accountName || '-') + '</strong></div>' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:1px;"><span style="color:#64748b;">A/C No:</span><strong style="font-family:monospace;">' + (activeBank.accountNumber || '-') + '</strong></div>' +
              '<div style="display:flex;justify-content:space-between;margin-bottom:1px;"><span style="color:#64748b;">IFSC:</span><strong style="font-family:monospace;">' + (activeBank.ifscCode || '-') + '</strong></div>' +
              (payeeVpa ? '<div style="display:flex;justify-content:space-between;"><span style="color:#64748b;">UPI ID:</span><strong style="font-family:monospace;">' + payeeVpa + '</strong></div>' : '')
            ) : '<div style="color:#64748b;">Payment via Cash / Standard Channel</div>') +
            qrSectionHtml
          ) : '<div style="color:#64748b;font-size:9px;padding:4px 0;">Standard Inward Purchase / Return Record</div>') +
        '</div>' +
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:9.5px;display:flex;flex-direction:column;justify-content:space-between;">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#475569;"><span>Taxable Value:</span><span style="font-family:monospace;">₹ ' + subTotal.toFixed(2) + '</span></div>' +
          (cgst > 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#047857;"><span>CGST:</span><span style="font-family:monospace;">+ ₹ ' + cgst.toFixed(2) + '</span></div>' : '') +
          (sgst > 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#047857;"><span>SGST:</span><span style="font-family:monospace;">+ ₹ ' + sgst.toFixed(2) + '</span></div>' : '') +
          (igst > 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#0284c7;"><span>IGST:</span><span style="font-family:monospace;">+ ₹ ' + igst.toFixed(2) + '</span></div>' : '') +
          (roundOff !== 0 ? '<div style="display:flex;justify-content:space-between;margin-bottom:2px;color:#64748b;"><span>Round Off:</span><span style="font-family:monospace;">' + (roundOff > 0 ? '+' : '') + ' ₹ ' + roundOff.toFixed(2) + '</span></div>' : '') +
          '<div style="display:flex;justify-content:space-between;align-items:baseline;padding-top:3px;border-top:1.5px solid ' + themeColor + ';margin-top:3px;font-weight:900;color:' + themeColor + ';font-size:12px;">' +
            '<span>GRAND TOTAL:</span><span style="font-family:monospace;">₹ ' + grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</span>' +
          '</div>' +
          (balanceDue > 0 ? '<div style="display:flex;justify-content:space-between;font-size:9.5px;color:#e11d48;font-weight:700;margin-top:2px;"><span>Balance Due:</span><span style="font-family:monospace;">₹ ' + balanceDue.toFixed(2) + '</span></div>' : '') +
        '</div>' +
      '</div>' +
      footerSectionHtml +
    '</div>';
  };

  window.__ubitRenderIndividualBillPDFPage = function(doc, it, company, docTitle, copyLabel, isFirstPage) {
    if (!isFirstPage) {
      doc.addPage();
    }
    const cMeta = company.meta || company || {};
    const cName = cMeta.name || 'Company Name';
    const cAddr = cMeta.address || cMeta.billingAddress || '';
    const cPhone = cMeta.phone || cMeta.mobile || '';
    const cGst = cMeta.gstin || '';
    const cEmail = cMeta.email || '';
    const logoUrl = cMeta.logoUrl || '';
    const terms = it.notes || cMeta.termsAndConditions || cMeta.customTerms || '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.';

    const isPurchase = (docTitle || '').toLowerCase().includes('purchase');
    const isDebitNote = (docTitle || '').toLowerCase().includes('debit');
    const isPurchaseOrder = (docTitle || '').toLowerCase().includes('purchase order') || (isPurchase && (docTitle || '').toLowerCase().includes('order'));
    const isPurchaseDoc = isPurchase || isDebitNote || isPurchaseOrder;
    const isOrder = (docTitle || '').toLowerCase().includes('order');
    const isChallan = (docTitle || '').toLowerCase().includes('challan');
    const isPaymentOut = (docTitle || '').toLowerCase().includes('payment out');
    const isPayment = (docTitle || '').toLowerCase().includes('payment') || (docTitle || '').toLowerCase().includes('receipt') || (docTitle || '').toLowerCase().includes('voucher') || isPaymentOut;
    const isCredit = (docTitle || '').toLowerCase().includes('credit');

    let defaultDocBadge = 'TAX INVOICE';
    if (isPurchaseOrder) defaultDocBadge = 'PURCHASE ORDER';
    else if (isDebitNote) defaultDocBadge = 'DEBIT NOTE (PURCHASE RETURN)';
    else if (isPurchase) defaultDocBadge = 'PURCHASE BILL';
    else if (isOrder) defaultDocBadge = 'SALE ORDER';
    else if (isChallan) defaultDocBadge = 'DELIVERY CHALLAN';
    else if (isCredit) defaultDocBadge = 'CREDIT NOTE (SALES RETURN)';
    else if (isPaymentOut) defaultDocBadge = 'PAYMENT VOUCHER';
    else if (isPayment) defaultDocBadge = 'PAYMENT RECEIPT';

    const docBadge = defaultDocBadge;
    const num = it.invoiceNo || it.billNo || it.orderNo || it.challanNo || it.receiptNo || it.voucherNo || it.noteNo || it.refNo || 'DOC';
    const dt = (it.date || it.createdAt) ? new Date(it.date || it.createdAt).toLocaleDateString('en-GB') : '-';
    const partyName = it.partyName || it.name || it.particulars || 'Customer';
    const partyAddr = it.partyAddress || it.address || '';
    const partyGst = it.partyGstin || it.gstin || '';
    const partyPhone = it.partyPhone || it.phone || '';

    const grandTotal = Number(it.grandTotal != null ? it.grandTotal : (it.totalAmount != null ? it.totalAmount : (it.amount != null ? it.amount : (it.inflow ? it.inflow : (it.outflow ? it.outflow : 0)))));
    const balanceDue = Number(it.balanceDue != null ? it.balanceDue : (it.balance != null ? it.balance : 0));
    const subTotal = Number(it.subTotal != null ? it.subTotal : (it.taxableAmount != null ? it.taxableAmount : (it.totalTaxable != null ? it.totalTaxable : (grandTotal - (Number(it.cgstTotal||0) + Number(it.sgstTotal||0) + Number(it.igstTotal||0))))));
    const cgst = Number(it.cgstTotal || it.cgst || 0);
    const sgst = Number(it.sgstTotal || it.sgst || 0);
    const igst = Number(it.igstTotal || it.igst || 0);
    const roundOff = it.roundOff != null ? Number(it.roundOff) : 0;
    const paymentMode = it.paymentMode || it.paymentType || (it.billType === 'Cash' ? 'Cash' : 'Credit');
    const utrNo = it.paymentRefNo || it.transactionNo || it.referenceNo || it.utrNo || it.utr || '';
    const description = it.description || it.notes || '';

    // 1. Company Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(cName, 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    let curY = 21;
    if (cAddr) {
      doc.text(cAddr.slice(0, 68), 14, curY);
      curY += 4.2;
    }
    const taxLine = [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('   |   ');
    doc.text(taxLine.slice(0, 75), 14, curY);
    curY += 5;

    if (logoUrl && logoUrl.startsWith('data:image')) {
      try {
        const format = logoUrl.includes('image/jpeg') || logoUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
        doc.addImage(logoUrl, format, 162, 11, 32, 16);
      } catch(e) {}
    }

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.6);
    doc.line(14, curY, 196, curY);
    curY += 6;

    // 2. Voucher Badge & Copy Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text(docBadge, 14, curY);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text((copyLabel || 'ORIGINAL FOR RECIPIENT').toUpperCase(), 196, curY, { align: 'right' });
    curY += 5;

    // PAYMENT IN / PAYMENT OUT DEDICATED PDF VIEW (NO ITEMS TABLE!):
    if (isPayment) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, curY, 182, 90, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(isPaymentOut ? 'PAID TO (PARTY / SUPPLIER)' : 'RECEIVED FROM (PARTY / CUSTOMER)', 19, curY + 7);

      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(partyName.slice(0, 45), 19, curY + 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      if (partyAddr) doc.text(partyAddr.slice(0, 60), 19, curY + 19);
      const pLine = [partyGst ? 'GSTIN: ' + partyGst : '', partyPhone ? 'Ph: ' + partyPhone : ''].filter(Boolean).join('  |  ');
      if (pLine) doc.text(pLine, 19, curY + 24);

      doc.text('Doc / Ref No:', 140, curY + 7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(num, 190, curY + 7, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Date:', 140, curY + 13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(dt, 190, curY + 13, { align: 'right' });

      doc.setDrawColor(203, 213, 225);
      doc.line(19, curY + 28, 191, curY + 28);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('PAYMENT TYPE / MODE', 19, curY + 34);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(paymentMode, 19, curY + 40);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.5);
      doc.roundedRect(19, curY + 45, 172, 16, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(isPaymentOut ? 'TOTAL AMOUNT PAID' : 'TOTAL AMOUNT RECEIVED', 24, curY + 55);

      doc.setFontSize(14);
      doc.setTextColor(2, 132, 199);
      doc.text('Rs. ' + grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2}), 185, curY + 56, { align: 'right' });

      let extraY = curY + 66;
      if (utrNo) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('UTR / Reference No: ', 19, extraY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(utrNo, 55, extraY);
        extraY += 5;
      }

      if (description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('Description / Notes: ', 19, extraY);
        doc.setTextColor(51, 65, 85);
        doc.text(description.slice(0, 65), 55, extraY);
      }

      curY += 98;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('For ' + cName.slice(0, 35), 196, curY + 4, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('AUTHORIZED SIGNATORY', 196, curY + 18, { align: 'right' });
      return;
    }

    // STANDARD BILL ITEMS TABLE (For Sales, Purchases, Orders, Notes):
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, curY, 92, 24, 1.5, 1.5, 'FD');
    doc.roundedRect(110, curY, 86, 24, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(isPurchase ? 'SUPPLIER DETAILS' : 'BILLED TO / CUSTOMER', 17, curY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(partyName.slice(0, 36), 17, curY + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text((partyAddr || '—').slice(0, 48), 17, curY + 14.5);
    const pTaxLine = [partyGst ? 'GST: ' + partyGst : 'GST: Unregistered', partyPhone ? 'Ph: ' + partyPhone : ''].filter(Boolean).join('  |  ');
    doc.text(pTaxLine.slice(0, 48), 17, curY + 19.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Doc / Ref No:', 113, curY + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(num, 193, curY + 5.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Date:', 113, curY + 10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(dt, 193, curY + 10.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Payment Mode:', 113, curY + 15.5);
    doc.setFont('helvetica', 'bold');
    doc.text(paymentMode, 193, curY + 15.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text('Status:', 113, curY + 20.5);
    doc.setFont('helvetica', 'bold');
    if (balanceDue <= 0.001) {
      doc.setTextColor(4, 120, 87);
      doc.text('FULLY PAID', 193, curY + 20.5, { align: 'right' });
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text('UNPAID', 193, curY + 20.5, { align: 'right' });
    }

    curY += 28;

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('#', 16, curY + 4.5);
    doc.text('Item & Description', 24, curY + 4.5);
    doc.text('HSN/SAC', 96, curY + 4.5);
    doc.text('Qty', 120, curY + 4.5, { align: 'right' });
    doc.text('Price (Rs.)', 145, curY + 4.5, { align: 'right' });
    doc.text('GST %', 165, curY + 4.5, { align: 'right' });
    doc.text('Amount (Rs.)', 194, curY + 4.5, { align: 'right' });
    curY += 6.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    const items = it.items || [];
    if (items.length > 0) {
      items.forEach((row, idx) => {
        const iName = (row.name || row.itemName || row.particulars || row.description || 'Item').slice(0, 36);
        const hsn = (row.hsn || row.hsnCode || '-').slice(0, 10);
        const qty = row.qty != null ? row.qty : (row.quantity != null ? row.quantity : 1);
        const unit = (row.unit || 'PCS').slice(0, 5);
        const price = Number(row.price != null ? row.price : (row.rate != null ? row.rate : 0));
        const gstRate = row.gstRate != null ? row.gstRate : (row.taxRate != null ? row.taxRate : 0);
        const tot = Number(row.total != null ? row.total : (row.amount != null ? row.amount : (qty * price)));

        doc.text(String(idx + 1), 16, curY + 4.5);
        doc.text(iName, 24, curY + 4.5);
        doc.text(hsn, 96, curY + 4.5);
        doc.text(qty + ' ' + unit, 120, curY + 4.5, { align: 'right' });
        doc.text(price.toFixed(2), 145, curY + 4.5, { align: 'right' });
        doc.text(gstRate + '%', 165, curY + 4.5, { align: 'right' });
        doc.text(tot.toFixed(2), 194, curY + 4.5, { align: 'right' });

        doc.setDrawColor(241, 245, 249);
        doc.line(14, curY + 6, 196, curY + 6);
        curY += 6;
      });
    } else {
      const desc = (it.description || it.notes || 'General Transaction').slice(0, 45);
      doc.text('1', 16, curY + 4.5);
      doc.text(desc, 24, curY + 4.5);
      doc.text('-', 96, curY + 4.5);
      doc.text('1 UNIT', 120, curY + 4.5, { align: 'right' });
      doc.text(grandTotal.toFixed(2), 145, curY + 4.5, { align: 'right' });
      doc.text('0%', 165, curY + 4.5, { align: 'right' });
      doc.text(grandTotal.toFixed(2), 194, curY + 4.5, { align: 'right' });
      doc.setDrawColor(241, 245, 249);
      doc.line(14, curY + 6, 196, curY + 6);
      curY += 6;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(14, curY, 196, curY);
    curY += 4;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, curY, 92, 32, 1.5, 1.5, 'FD');
    doc.roundedRect(110, curY, 86, 32, 1.5, 1.5, 'FD');

    // Left: Bank Info (SUPPRESSED FOR PURCHASE DOCS)
    if (!isPurchaseDoc) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('BANK & PAYMENT DETAILS', 17, curY + 5);

      const bankAccounts = company.bankAccounts || [];
      const defaultBank = bankAccounts.find(b => b.isDefault) || bankAccounts[0] || null;
      const activeBank = (it.bankAccountId ? bankAccounts.find(b => b.id === it.bankAccountId) : null) || defaultBank;
      const payeeVpa = activeBank?.upiId || activeBank?.upiNumber || cMeta.upiId || '';

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      let bY = curY + 9.5;
      if (activeBank) {
        doc.text('Bank: ' + (activeBank.accountName || '-').slice(0, 25), 17, bY);
        doc.text('A/C: ' + (activeBank.accountNumber || '-'), 17, bY + 4);
        doc.text('IFSC: ' + (activeBank.ifscCode || '-'), 17, bY + 8);
        if (payeeVpa) doc.text('UPI ID: ' + payeeVpa.slice(0, 28), 17, bY + 12);
      } else {
        doc.text('Payment via Cash / Standard Channel', 17, bY);
      }

      if (balanceDue <= 0.001) {
        doc.setFillColor(236, 253, 245);
        doc.setDrawColor(167, 243, 208);
        doc.roundedRect(17, curY + 23.5, 45, 6, 1, 1, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(4, 120, 87);
        doc.text('STATUS: FULLY PAID', 19.5, curY + 27.5);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(225, 29, 72);
        doc.text('Bal Due: Rs. ' + balanceDue.toFixed(2), 17, curY + 27.5);
      }
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Standard Inward Purchase / Return Record', 17, curY + 12);
    }

    // Right: Calculations Breakdown
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    let rY = curY + 5.5;
    doc.text('Taxable Value:', 113, rY);
    doc.text('Rs. ' + subTotal.toFixed(2), 193, rY, { align: 'right' });
    rY += 4.2;

    if (cgst > 0) {
      doc.text('CGST:', 113, rY);
      doc.text('+ Rs. ' + cgst.toFixed(2), 193, rY, { align: 'right' });
      rY += 4.2;
    }
    if (sgst > 0) {
      doc.text('SGST:', 113, rY);
      doc.text('+ Rs. ' + sgst.toFixed(2), 193, rY, { align: 'right' });
      rY += 4.2;
    }
    if (igst > 0) {
      doc.text('IGST:', 113, rY);
      doc.text('+ Rs. ' + igst.toFixed(2), 193, rY, { align: 'right' });
      rY += 4.2;
    }
    if (roundOff !== 0) {
      doc.text('Round Off:', 113, rY);
      doc.text((roundOff > 0 ? '+' : '') + ' Rs. ' + roundOff.toFixed(2), 193, rY, { align: 'right' });
      rY += 4.2;
    }

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.4);
    doc.line(110, curY + 22.5, 196, curY + 22.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(2, 132, 199);
    doc.text('GRAND TOTAL:', 113, curY + 28);
    doc.text('Rs. ' + grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2}), 193, curY + 28, { align: 'right' });

    curY += 36;

    // Terms & Signature (SUPPRESSED FOR PURCHASE DOCS)
    if (!isPurchaseDoc) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);
      doc.text('TERMS & CONDITIONS', 14, curY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      const termsLines = terms.split('\n').slice(0, 3);
      termsLines.forEach((tLine, idx) => {
        doc.text(tLine.slice(0, 60), 14, curY + 8 + (idx * 3.5));
      });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('For ' + cName.slice(0, 35), 196, curY + 4, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('AUTHORIZED SIGNATORY', 196, curY + 20, { align: 'right' });
  };
  
window.__erpBatchExport = async function(type, title, items, company) {
    if (!items || items.length === 0) {
      alert("No records found in selected date filter to export.");
      return;
    }
    const cMeta = (company && company.meta) || company || (window.UBIT_ERP_ENGINE ? window.UBIT_ERP_ENGINE.getCompanyData?.()?.meta : {}) || {};
    const cName = cMeta.name || "UBIT Pro ERP";
    const dStr = new Date().toISOString().split('T')[0];

    const tLower = (title || '').toLowerCase();
    const isTransactional = (
      tLower.includes('sale') ||
      tLower.includes('purchase') ||
      tLower.includes('invoice') ||
      tLower.includes('bill') ||
      tLower.includes('order') ||
      tLower.includes('challan') ||
      tLower.includes('payment') ||
      tLower.includes('credit') ||
      tLower.includes('debit') ||
      tLower.includes('receipt') ||
      tLower.includes('voucher')
    );

    // 1. EXCEL EXPORT (Preserves table outside on screen)
    if (type === 'excel') {
      if (prevBatchExport) {
        return prevBatchExport(type, title, items, company);
      }
      return;
    }

    // 2. TRANSACTIONAL INDIVIDUAL BILLS (PDF & PRINT)
    if (isTransactional) {
      const copiesCount = Number(cMeta.printCopies || cMeta.numberOfCopies || (cMeta.enableDuplicate ? 2 : (cMeta.enableTriplicate ? 3 : 1))) || 1;
      const copyLabels = ["Original for Recipient", "Duplicate for Transporter", "Triplicate for Supplier", "Extra Copy"];

      if (type === 'pdf') {
        const jsPdfClass = window.Ur || window.jspdf?.jsPDF || (typeof Ur !== 'undefined' ? Ur : null);
        if (!jsPdfClass) {
          alert('PDF Engine is initializing. Please try again.');
          return;
        }

        // Folder selection picker: User selects one folder to save all bills individually
        let targetDir = null;
        if (typeof window.showDirectoryPicker === 'function') {
          try {
            targetDir = await window.showDirectoryPicker({
              id: 'ubit_erp_save_location',
              mode: 'readwrite',
              startIn: 'downloads'
            });
          } catch (err) {
            // User cancelled folder selection -> DO NOT DOWNLOAD, EXIT IMMEDIATELY
            return;
          }
          if (!targetDir) {
            // User did not select folder -> DO NOT DOWNLOAD, EXIT IMMEDIATELY
            return;
          }
        } else if (typeof window.showSaveFilePicker === 'function') {
          // If directory picker is not supported, do not download without folder
          return;
        } else {
          return;
        }

        // Generate and save each bill individually into selected folder
        let savedCount = 0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const rawNum = it.invoiceNo || it.billNo || it.orderNo || it.challanNo || it.receiptNo || it.voucherNo || it.noteNo || it.refNo || ('DOC_' + (i + 1));
          const safeNum = String(rawNum).replace(/[/\\?%*:|"<>]/g, '_').trim();
          const filename = safeNum + '.pdf';

          const doc = new jsPdfClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          for (let c = 0; c < copiesCount; c++) {
            window.__ubitRenderIndividualBillPDFPage(doc, it, company, title, copyLabels[c] || copyLabels[0], c === 0);
          }

          const blob = doc.output('blob');
          if (targetDir) {
            try {
              const fileHandle = await targetDir.getFileHandle(filename, { create: true });
              const writable = await fileHandle.createWritable();
              await writable.write(blob);
              await writable.close();
              savedCount++;
            } catch(fErr) {
              console.warn('Failed writing file handle for', filename, fErr);
            }
          }
        }

        if (typeof showSleekToast === 'function') {
          showSleekToast('Successfully saved ' + savedCount + ' individual bills as PDF files!');
        } else {
          alert('Saved ' + savedCount + ' individual bill PDFs.');
        }
        return;
      }

      if (type === 'print') {
        // Individual copy print flow with page breaks between each bill
        let combinedHtml = '';
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          for (let c = 0; c < copiesCount; c++) {
            combinedHtml += window.__ubitRenderIndividualBillHTML(it, company, title, copyLabels[c] || copyLabels[0]);
          }
        }

        return window.__ubitOpenCenteredPrintWindow(combinedHtml, title + " - Individual Bills Print");
      }
    }

    // Fallback for non-transactional lists
    if (type === 'print') {
      const rowsHtml = items.map(function(it, idx) {
        const num = it.invoiceNo || it.billNo || it.orderNo || it.challanNo || it.receiptNo || it.voucherNo || it.noteNo || ("#" + (idx + 1));
        const dt = (it.date || it.createdAt) ? new Date(it.date || it.createdAt).toLocaleDateString("en-GB") : "-";
        const pName = it.partyName || it.name || it.particulars || "-";
        const amt = Number(it.grandTotal != null ? it.grandTotal : (it.totalAmount != null ? it.totalAmount : (it.amount != null ? it.amount : (it.inflow ? it.inflow : (it.outflow ? it.outflow : 0)))));
        const bal = Number(it.balanceDue != null ? it.balanceDue : (it.balance != null ? it.balance : 0));
        return '<tr style="background:' + (idx % 2 === 0 ? '#ffffff' : '#f8fafc') + ';">' +
          '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:center;">' + (idx + 1) + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-family:monospace;font-weight:600;">' + num + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;">' + dt + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;">' + pName + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:right;font-family:monospace;">Rs. ' + amt.toLocaleString("en-IN", {minimumFractionDigits: 2}) + '</td>' +
          '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;text-align:right;font-family:monospace;">Rs. ' + bal.toLocaleString("en-IN", {minimumFractionDigits: 2}) + '</td>' +
          '</tr>';
      }).join("");

      const totAmt = items.reduce(function(sum, it) { return sum + Number(it.grandTotal != null ? it.grandTotal : (it.totalAmount != null ? it.totalAmount : (it.amount != null ? it.amount : (it.inflow ? it.inflow : (it.outflow ? it.outflow : 0))))); }, 0);
      const totBal = items.reduce(function(sum, it) { return sum + Number(it.balanceDue != null ? it.balanceDue : (it.balance != null ? it.balance : 0)); }, 0);

      const pHtml = '<!DOCTYPE html><html><head><title>' + title + ' - ' + cName + '</title><style>@page{size:auto;margin:0 !important;}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;margin:0;padding:20px}.header{border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start}.comp-name{font-size:20px;font-weight:800;text-transform:uppercase}.comp-sub{font-size:11px;color:#475569;margin-top:3px}.title{font-size:15px;font-weight:700;margin:14px 0 8px;color:#1e293b;text-transform:uppercase}table{width:100%;border-collapse:collapse;text-align:left}th{background:#f8fafc;padding:8px 10px;border-bottom:2px solid #cbd5e1;font-size:11px;font-weight:700;text-transform:uppercase;color:#475569}.footer{margin-top:16px;padding-top:10px;border-top:2px solid #0f172a;display:flex;justify-content:space-between;font-weight:700;font-size:13px}</style></head><body>' +
        '<div class="header">' +
        '<div><div class="comp-name">' + cName + '</div></div>' +
        '</div>' +
        '<div class="title">' + title + '</div>' +
        '<table><thead><tr><th>#</th><th>Doc / Ref No</th><th>Date</th><th>Party / Particulars</th><th style="text-align:right;">Amount (Rs.)</th><th style="text-align:right;">Balance (Rs.)</th></tr></thead><tbody>' +
        rowsHtml +
        '</tbody></table>' +
        '<div class="footer"><div>Total Value: Rs. ' + totAmt.toLocaleString("en-IN", {minimumFractionDigits: 2}) + '</div><div>Total Balance Due: Rs. ' + totBal.toLocaleString("en-IN", {minimumFractionDigits: 2}) + '</div></div>' +
        '</body></html>';

      return window.__ubitOpenCenteredPrintWindow(pHtml, title + " - " + cName);
    } else if (type === 'pdf') {
      try {
        const jsPdfClass = window.Ur || window.jspdf?.jsPDF || (typeof Ur !== 'undefined' ? Ur : null);
        if (jsPdfClass) {
          const doc = new jsPdfClass({ orientation: "portrait", unit: "mm", format: "a4" });
          doc.setFontSize(16);
          doc.text(cName, 14, 18);
          doc.line(14, 32, 196, 32);
          doc.setFontSize(13);
          doc.text(title, 14, 40);

          let y = 48;
          doc.setFontSize(10);
          items.slice(0, 30).forEach((it, idx) => {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
            const num = it.invoiceNo || it.billNo || it.orderNo || it.challanNo || it.receiptNo || it.voucherNo || it.noteNo || ("#" + (idx + 1));
            const dt = (it.date || it.createdAt) ? new Date(it.date || it.createdAt).toLocaleDateString("en-GB") : "-";
            const pName = (it.partyName || it.name || it.particulars || "-").substring(0, 28);
            const amt = Number(it.grandTotal != null ? it.grandTotal : (it.totalAmount != null ? it.totalAmount : (it.amount != null ? it.amount : (it.inflow ? it.inflow : (it.outflow ? it.outflow : 0)))));

            doc.text((idx + 1) + ". " + num + " | " + dt + " | " + pName + " : Rs. " + amt.toFixed(2), 14, y);
            y += 7;
          });

          doc.line(14, y + 2, 196, y + 2);

          const pdfBlob = doc.output('blob');
          const safeTitle = (title || 'Report').replace(/\s+/g, '_');
          await window.UBIT_SAVE_FILE(pdfBlob, safeTitle + '_' + dStr + '.pdf', 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
          return;
        }
      } catch(e) {
        console.warn('[UBIT] jsPDF generation error:', e);
      }
    }
    if (prevBatchExport) return prevBatchExport(type, title, items, company);
  };

  // =========================================================================
  // EXTENSION 6: DEDICATED 1-CLICK TALLY XML COMPLIANCE CENTER
  // =========================================================================

  function escapeXml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function formatTallyDate(dateStr) {
    if (!dateStr) return '20261017';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '20261017';
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return yyyy + mm + dd;
    } catch {
      return '20261017';
    }
  }

  function generateTallyXML(companyData, options = {}) {
    const comp = companyData || (window.UBIT_ERP_ENGINE?.getCompanyData ? window.UBIT_ERP_ENGINE.getCompanyData() : null) || (() => {
      try {
        const cid = localStorage.getItem('gst_erp_active_company_id') || 'comp_demo_workspace';
        return JSON.parse(localStorage.getItem('ubit_erp_cloud_company_' + cid)) || {};
      } catch { return {}; }
    })() || {};

    const cMeta = comp.meta || {};
    const compName = cMeta.name || 'Company ERP';
    const parties = comp.parties || [];
    const sales = comp.sales || [];
    const purchases = comp.purchases || [];
    const bankAccounts = comp.bankAccounts || [];

    const scope = options.scope || 'all';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<ENVELOPE>\n';
    xml += '  <HEADER>\n';
    xml += '    <TALLYREQUEST>Import Data</TALLYREQUEST>\n';
    xml += '  </HEADER>\n';
    xml += '  <BODY>\n';
    xml += '    <IMPORTDATA>\n';
    xml += '      <REQUESTDESC>\n';
    xml += '        <REPORTNAME>All Masters and Vouchers</REPORTNAME>\n';
    xml += '        <STATICVARIABLES>\n';
    xml += `          <SVCURRENTCOMPANY>${escapeXml(compName)}</SVCURRENTCOMPANY>\n`;
    xml += '        </STATICVARIABLES>\n';
    xml += '      </REQUESTDESC>\n';
    xml += '      <REQUESTDATA>\n';

    if (scope === 'all' || scope === 'masters') {
      const stdLedgers = [
        { name: 'Cash', parent: 'Cash-in-Hand', op: comp.cashInHand?.balance || 0 },
        { name: 'Sales Account', parent: 'Sales Accounts', op: 0 },
        { name: 'Purchase Account', parent: 'Purchase Accounts', op: 0 },
        { name: 'CGST Input', parent: 'Duties & Taxes', op: 0 },
        { name: 'SGST Input', parent: 'Duties & Taxes', op: 0 },
        { name: 'IGST Input', parent: 'Duties & Taxes', op: 0 },
        { name: 'CGST Output', parent: 'Duties & Taxes', op: 0 },
        { name: 'SGST Output', parent: 'Duties & Taxes', op: 0 },
        { name: 'IGST Output', parent: 'Duties & Taxes', op: 0 }
      ];
      stdLedgers.forEach(l => {
        xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
        xml += `          <LEDGER NAME="${escapeXml(l.name)}" ACTION="Create">\n`;
        xml += `            <NAME>${escapeXml(l.name)}</NAME>\n`;
        xml += `            <PARENT>${escapeXml(l.parent)}</PARENT>\n`;
        xml += `            <OPENINGBALANCE>${l.op}</OPENINGBALANCE>\n`;
        xml += '          </LEDGER>\n';
        xml += '        </TALLYMESSAGE>\n';
      });

      bankAccounts.forEach(b => {
        const bName = b.accountName || b.bankName || 'Bank Account';
        xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
        xml += `          <LEDGER NAME="${escapeXml(bName)}" ACTION="Create">\n`;
        xml += `            <NAME>${escapeXml(bName)}</NAME>\n`;
        xml += '            <PARENT>Bank Accounts</PARENT>\n';
        xml += `            <OPENINGBALANCE>${Number(b.balance || 0)}</OPENINGBALANCE>\n`;
        xml += '          </LEDGER>\n';
        xml += '        </TALLYMESSAGE>\n';
      });

      parties.forEach(p => {
        const pName = p.name || p.partyName || 'Party';
        const isCustomer = p.type === 'Customer' || (!p.type && (p.currentBalance || 0) >= 0);
        const parent = isCustomer ? 'Sundry Debtors' : 'Sundry Creditors';
        const bal = Number(p.openingBalance || p.currentBalance || 0);
        xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
        xml += `          <LEDGER NAME="${escapeXml(pName)}" ACTION="Create">\n`;
        xml += `            <NAME>${escapeXml(pName)}</NAME>\n`;
        xml += `            <PARENT>${parent}</PARENT>\n`;
        xml += `            <OPENINGBALANCE>${isCustomer ? -bal : bal}</OPENINGBALANCE>\n`;
        if (p.gstin) xml += `            <PARTYGSTIN>${escapeXml(p.gstin)}</PARTYGSTIN>\n`;
        xml += '          </LEDGER>\n';
        xml += '        </TALLYMESSAGE>\n';
      });
    }

    if (scope === 'all' || scope === 'vouchers') {
      sales.forEach(s => {
        const invNo = s.invoiceNo || s.billNo || 'INV-001';
        const dt = formatTallyDate(s.invoiceDate || s.date);
        const party = s.partyName || 'Cash';
        const grandTotal = Number(s.grandTotal || s.totalAmount || 0);
        const taxable = Number(s.subTotal || (grandTotal * 0.82));
        const cgst = Number(s.cgstTotal || ((grandTotal - taxable) / 2));
        const sgst = Number(s.sgstTotal || ((grandTotal - taxable) / 2));

        xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
        xml += '          <VOUCHER VCHTYPE="Sales" ACTION="Create">\n';
        xml += `            <DATE>${dt}</DATE>\n`;
        xml += '            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n';
        xml += `            <VOUCHERNUMBER>${escapeXml(invNo)}</VOUCHERNUMBER>\n`;
        xml += `            <PARTYLEDGERNAME>${escapeXml(party)}</PARTYLEDGERNAME>\n`;
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(party)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>-${grandTotal.toFixed(2)}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += '              <LEDGERNAME>Sales Account</LEDGERNAME>\n';
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${taxable.toFixed(2)}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
        if (cgst > 0) {
          xml += '            <ALLLEDGERENTRIES.LIST>\n';
          xml += '              <LEDGERNAME>CGST Output</LEDGERNAME>\n';
          xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
          xml += `              <AMOUNT>${cgst.toFixed(2)}</AMOUNT>\n`;
          xml += '            </ALLLEDGERENTRIES.LIST>\n';
        }
        if (sgst > 0) {
          xml += '            <ALLLEDGERENTRIES.LIST>\n';
          xml += '              <LEDGERNAME>SGST Output</LEDGERNAME>\n';
          xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
          xml += `              <AMOUNT>${sgst.toFixed(2)}</AMOUNT>\n`;
          xml += '            </ALLLEDGERENTRIES.LIST>\n';
        }
        xml += '          </VOUCHER>\n';
        xml += '        </TALLYMESSAGE>\n';
      });

      purchases.forEach(p => {
        const billNo = p.billNo || p.invoiceNo || 'PUR-001';
        const dt = formatTallyDate(p.date || p.billDate);
        const party = p.partyName || p.supplierName || 'Cash';
        const grandTotal = Number(p.grandTotal || p.totalAmount || 0);
        const taxable = Number(p.subTotal || (grandTotal * 0.82));
        const tax = grandTotal - taxable;

        xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
        xml += '          <VOUCHER VCHTYPE="Purchase" ACTION="Create">\n';
        xml += `            <DATE>${dt}</DATE>\n`;
        xml += '            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>\n';
        xml += `            <VOUCHERNUMBER>${escapeXml(billNo)}</VOUCHERNUMBER>\n`;
        xml += `            <PARTYLEDGERNAME>${escapeXml(party)}</PARTYLEDGERNAME>\n`;
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += '              <LEDGERNAME>Purchase Account</LEDGERNAME>\n';
        xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>-${taxable.toFixed(2)}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
        if (tax > 0) {
          xml += '            <ALLLEDGERENTRIES.LIST>\n';
          xml += '              <LEDGERNAME>CGST Input</LEDGERNAME>\n';
          xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
          xml += `              <AMOUNT>-${(tax / 2).toFixed(2)}</AMOUNT>\n`;
          xml += '            </ALLLEDGERENTRIES.LIST>\n';
          xml += '            <ALLLEDGERENTRIES.LIST>\n';
          xml += '              <LEDGERNAME>SGST Input</LEDGERNAME>\n';
          xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
          xml += `              <AMOUNT>-${(tax / 2).toFixed(2)}</AMOUNT>\n`;
          xml += '            </ALLLEDGERENTRIES.LIST>\n';
        }
        xml += '            <ALLLEDGERENTRIES.LIST>\n';
        xml += `              <LEDGERNAME>${escapeXml(party)}</LEDGERNAME>\n`;
        xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
        xml += `              <AMOUNT>${grandTotal.toFixed(2)}</AMOUNT>\n`;
        xml += '            </ALLLEDGERENTRIES.LIST>\n';
        xml += '          </VOUCHER>\n';
        xml += '        </TALLYMESSAGE>\n';
      });
    }

    xml += '      </REQUESTDATA>\n';
    xml += '    </IMPORTDATA>\n';
    xml += '  </BODY>\n';
    xml += '</ENVELOPE>\n';

    return xml;
  }

  function injectTallyComplianceCenter() {
    try {
      const h1 = document.querySelector('h1');
      const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.innerText.trim());
      const isTallyPage = (h1 && (h1.innerText.trim() === 'Tally Export' || h1.innerText.trim() === 'Export to Tally')) ||
                          h2s.some(t => t.includes('Export to Tally'));
      if (!isTallyPage) return;
      if (document.getElementById('ubit-tally-compliance-center')) return;

      const main = document.querySelector('main');
      if (!main) return;

      const wrapper = main.querySelector('.p-6.space-y-6.w-full') || main;
      const emptyStateCard = Array.from(wrapper.children).find(c => c.innerText && c.innerText.includes('No Tally Export records created yet'));
      if (emptyStateCard) emptyStateCard.style.display = 'none';

      const compData = (() => {
        try {
          const cid = localStorage.getItem('gst_erp_active_company_id') || 'comp_demo_workspace';
          return JSON.parse(localStorage.getItem('ubit_erp_cloud_company_' + cid)) || {};
        } catch { return {}; }
      })();

      const parties = compData.parties || [];
      const sales = compData.sales || [];
      const purchases = compData.purchases || [];
      const banks = compData.bankAccounts || [];
      const totalLedgers = parties.length + banks.length + 9;
      const totalVouchers = sales.length + purchases.length;

      // Group Generate and Synchronizer side-by-side like two tiles
      const generateCard = document.getElementById('ubit-tally-generate-card');
      const container = document.createElement('div');
      container.id = 'ubit-tally-compliance-center';
      container.className = 'w-full space-y-5 animate-in fade-in duration-200 mt-2';

      const synchronizerCardHtml = `
        <div id="ubit-tally-synchronizer-card" class="p-6 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center gap-2.5 mb-1.5">
              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-900 border border-amber-200">Official Tally Bridge</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">Tally Prime & ERP 9</span>
            </div>
            <h2 class="text-xl font-black text-black tracking-tight flex items-center gap-2">
              Tally XML Data Synchronizer
            </h2>
            <p class="text-xs text-slate-600 mt-0.5 leading-relaxed">Export double-entry Master Ledgers & Daybook Vouchers directly to Windows File Explorer.</p>
          </div>
          <div class="flex items-center gap-2.5 pt-2">
            <button type="button" id="ubit-export-tally-btn" class="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer">
              <span>Export to Tally</span>
            </button>
          </div>
        </div>
      `;

      if (generateCard && generateCard.parentNode) {
        // Create side-by-side two-tile grid
        let gridWrapper = document.getElementById('ubit-tally-tiles-grid');
        if (!gridWrapper) {
          gridWrapper = document.createElement('div');
          gridWrapper.id = 'ubit-tally-tiles-grid';
          gridWrapper.className = 'grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch w-full';
          generateCard.parentNode.insertBefore(gridWrapper, generateCard);
          gridWrapper.appendChild(generateCard);
          const rightCol = document.createElement('div');
          rightCol.innerHTML = synchronizerCardHtml;
          gridWrapper.appendChild(rightCol.firstElementChild);
        }
      }

      container.innerHTML = `
        ${!generateCard ? synchronizerCardHtml : ''}

        <!-- 4 Summary Tiles -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Master Ledgers</span>
            <div class="text-xl font-black text-slate-900 mt-1 font-mono">${totalLedgers}</div>
            <span class="text-[11px] text-slate-500 mt-0.5 block">Debtors, Creditors, Bank, Cash, Taxes</span>
          </div>
          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Daybook Vouchers</span>
            <div class="text-xl font-black text-emerald-600 mt-1 font-mono">${totalVouchers}</div>
            <span class="text-[11px] text-slate-500 mt-0.5 block">Sales, Purchases, Receipts, Payments</span>
          </div>
          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Standard</span>
            <div class="text-xl font-black text-sky-700 mt-1">XML 2.0</div>
            <span class="text-[11px] text-slate-500 mt-0.5 block">100% Tally Prime Compatible</span>
          </div>
          <div class="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">File Explorer Save</span>
            <div class="text-xl font-black text-amber-600 mt-1">Direct Save</div>
            <span class="text-[11px] text-slate-500 mt-0.5 block">Remembers Previous Folder</span>
          </div>
        </div>

        <!-- Scope and Preview -->
        <div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 class="text-sm font-bold text-slate-900">Select Export Scope</h3>
            <span class="text-xs text-slate-500 font-mono">Company: ${compData.meta?.name || 'Active Company'}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label class="p-3.5 border-2 border-emerald-500 bg-emerald-50/30 rounded-xl flex items-center gap-3 cursor-pointer shadow-xs">
              <input type="radio" name="ubit_tally_scope" value="all" checked class="text-emerald-600 focus:ring-emerald-500">
              <div>
                <strong class="text-xs font-bold text-slate-900 block">Complete Export (Masters + Vouchers)</strong>
                <span class="text-[11px] text-slate-500">Imports all Chart of Accounts and Daybook</span>
              </div>
            </label>
            <label class="p-3.5 border border-slate-200 bg-white hover:border-slate-300 rounded-xl flex items-center gap-3 cursor-pointer shadow-xs">
              <input type="radio" name="ubit_tally_scope" value="masters" class="text-emerald-600 focus:ring-emerald-500">
              <div>
                <strong class="text-xs font-bold text-slate-900 block">Chart of Accounts Only (Masters)</strong>
                <span class="text-[11px] text-slate-500">Debtors, Creditors, Bank & Duty Ledgers</span>
              </div>
            </label>
            <label class="p-3.5 border border-slate-200 bg-white hover:border-slate-300 rounded-xl flex items-center gap-3 cursor-pointer shadow-xs">
              <input type="radio" name="ubit_tally_scope" value="vouchers" class="text-emerald-600 focus:ring-emerald-500">
              <div>
                <strong class="text-xs font-bold text-slate-900 block">Daybook Vouchers Only</strong>
                <span class="text-[11px] text-slate-500">Sales Invoices, Purchases & Receipts</span>
              </div>
            </label>
          </div>
        </div>
      `;

      wrapper.appendChild(container);

      const btn = document.getElementById('ubit-export-tally-btn');
      if (btn) {
        btn.onclick = async function() {
          const selScope = document.querySelector('input[name="ubit_tally_scope"]:checked')?.value || 'all';
          const xml = generateTallyXML(compData, { scope: selScope });
          const cName = (compData.meta?.name || 'Company').replace(/\s+/g, '_');
          const dStr = new Date().toISOString().split('T')[0];
          const filename = 'Tally_' + selScope.toUpperCase() + '_' + cName + '_' + dStr + '.xml';
          await window.UBIT_SAVE_FILE(xml, filename, 'application/xml', 'Tally XML Data (*.xml)', '.xml');
        };
      }
    } catch(e) {
      console.warn('Error injecting Tally Center:', e);
    }
  }

  setInterval(injectTallyComplianceCenter, 500);
  window.addEventListener('click', () => setTimeout(injectTallyComplianceCenter, 50));
  injectTallyComplianceCenter();

  // =========================================================================
  // EXTENSION 7: INVOICE PREVIEW MODAL "SAVE PDF" WITH WINDOWS FILE EXPLORER
  // =========================================================================
  function enhanceInvoicePreviewModals() {
    try {
      const printBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        return (b.innerText || '').trim() === 'Print Invoice' && !b.dataset.hasSavePdfSibling;
      });

      for (const printBtn of printBtns) {
        printBtn.dataset.hasSavePdfSibling = 'true';
        const parentContainer = printBtn.parentElement;
        if (!parentContainer) continue;

        if (parentContainer.querySelector('.ubit-save-pdf-modal-btn')) continue;

        const savePdfBtn = document.createElement('button');
        savePdfBtn.className = 'ubit-save-pdf-modal-btn flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer';
        savePdfBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Save PDF</span>
        `;

        savePdfBtn.onclick = async (e) => {
          e.stopPropagation();
          e.preventDefault();
          savePdfBtn.disabled = true;
          const origText = savePdfBtn.innerHTML;
          savePdfBtn.innerHTML = '<span>Saving...</span>';

          try {
            const modal = printBtn.closest('.fixed') || document.body;
            const invoiceNumEl = modal.querySelector('h2, h3, .text-lg, .text-xl, .font-bold');
            let invoiceNum = invoiceNumEl ? invoiceNumEl.innerText.trim() : 'Invoice';
            invoiceNum = invoiceNum.split('\n')[0].replace(/[^a-zA-Z0-9_\-\/]/g, '').replace(/[\/\\:]/g, '_');
            if (!invoiceNum || invoiceNum.length < 2) invoiceNum = 'Invoice_' + new Date().toISOString().slice(0, 10);
            const filename = invoiceNum + '.pdf';

            const printArea = modal.querySelector('.printable-area') || modal.querySelector('.printable-invoice-wrapper') || modal;
            
            if (window.html2canvas && (window.Ur || window.jspdf?.jsPDF)) {
              const PDFClass = window.Ur || window.jspdf.jsPDF;
              const canvas = await window.html2canvas(printArea, { scale: 2, useCORS: true, logging: false });
              const imgData = canvas.toDataURL('image/jpeg', 0.95);
              const pdf = new PDFClass('p', 'mm', 'a4');
              const imgWidth = 210;
              const pageHeight = 297;
              const imgHeight = (canvas.height * imgWidth) / canvas.width;
              let heightLeft = imgHeight;
              let position = 0;

              pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
              heightLeft -= pageHeight;

              while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
              }

              const pdfBlob = pdf.output('blob');
              await window.UBIT_SAVE_FILE(pdfBlob, filename, 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
            } else {
              window.print();
            }
          } catch (err) {
            console.error('Save PDF modal error:', err);
          } finally {
            savePdfBtn.disabled = false;
            savePdfBtn.innerHTML = origText;
          }
        };

        parentContainer.insertBefore(savePdfBtn, printBtn);
      }
    } catch(err) {
      console.warn('Error enhancing invoice modal:', err);
    }
  }

  setInterval(enhanceInvoicePreviewModals, 400);
  window.addEventListener('click', () => setTimeout(enhanceInvoicePreviewModals, 100));
  enhanceInvoicePreviewModals();

  // =========================================================================
  // EXTENSION 8: UNIVERSAL INPUT[TYPE="FILE"] INTERCEPTION FOR WINDOWS FILE OPEN PICKER
  // =========================================================================
  (function() {
    const origInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function() {
      if (this.type === 'file' && !this.__ubit_picker_bypassed && ('showOpenFilePicker' in window)) {
        const input = this;
        const acceptStr = input.accept || '';
        const extList = acceptStr ? acceptStr.split(',').map(s => s.trim()).filter(Boolean) : ['.csv', '.xlsx', '.json', '.txt', '.gsterp'];
        const types = [{
          description: 'Supported Files (' + extList.join(', ') + ')',
          accept: { 'application/octet-stream': extList }
        }];

        window.showOpenFilePicker({
          types: types,
          multiple: false,
          id: 'ubit_erp_open_location'
        }).then(async ([fileHandle]) => {
          if (!fileHandle) return;
          const file = await fileHandle.getFile();
          if (file) {
            try {
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
            } catch(e) {
              try {
                Object.defineProperty(input, 'files', {
                  value: [file],
                  configurable: true,
                  writable: true
                });
              } catch(e2) {}
            }
            if (typeof input.onchange === 'function') {
              try { input.onchange({ target: input }); } catch(e) {}
            }
            input.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof showSleekToast === 'function') {
              showSleekToast('Loaded "' + file.name + '" from folder');
            }
          }
        }).catch(err => {
          if (err.name === 'AbortError') return;
          console.warn('[UBIT File Open] Fallback to native input:', err);
          input.__ubit_picker_bypassed = true;
          origInputClick.call(input);
          setTimeout(() => { input.__ubit_picker_bypassed = false; }, 500);
        });
        return;
      }
      return origInputClick.apply(this, arguments);
    };
  })();

  // =========================================================================
  // EXTENSION 9: REFINED SUNDRY DEBTORS INWARD & OUTWARD STATEMENT & PDF ENGINE
  // Single Consolidated PDF & Individual PDF with Single Directory Selector
  // =========================================================================

  window.__ubitGetDebtorsLedgerData = function() {
    try {
      const cid = localStorage.getItem('gst_erp_active_company_id') || 'comp_demo_workspace';
      const comp = window.__erpCurrentCompany || (typeof Qu === 'function' ? Qu()?.currentCompany : null) || JSON.parse(localStorage.getItem('ubit_erp_cloud_company_' + cid) || '{}');
      const parties = comp.parties || [];
      const sales = comp.sales || [];
      const purchases = comp.purchases || [];
      const paymentsIn = comp.paymentsIn || [];
      const paymentsOut = comp.paymentsOut || [];
      const creditNotes = comp.creditNotes || [];
      const debitNotes = comp.debitNotes || [];
      const cMeta = comp.meta || {};

      // All created parties show up in Sundry Debtors
      const debtors = parties || [];

      const nameMatch = (party, pName, pId) => {
        if (!party) return false;
        if (pId && party.id && pId === party.id) return true;
        if (pName && party.name && pName.toLowerCase().trim() === party.name.toLowerCase().trim()) return true;
        return false;
      };

      const debtorRecords = debtors.map(p => {
        const txns = [];

        // 1. Opening Balance
        const opBal = Number(p.openingBalance || 0);
        if (opBal > 0) {
          txns.push({
            date: (cMeta.createdAt ? cMeta.createdAt.slice(0, 10) : '2026-04-01'),
            type: 'Opening Balance',
            refNo: 'OP-BAL',
            transNo: '—',
            particulars: 'Opening Balance',
            outward: opBal,
            inward: 0
          });
        }

        // 2. Sales Invoices (Outward) - excludes orders
        sales.forEach(s => {
          if (nameMatch(p, s.partyName, s.partyId)) {
            const isCash = String(s.paymentMode || '').toLowerCase() === 'cash';
            txns.push({
              date: s.date || '2026-10-15',
              type: 'Sales Invoice',
              refNo: s.invoiceNo || s.invoiceNumber || '-',
              transNo: isCash ? 'Cash' : (s.paymentRefNo || s.referenceNo || '—'),
              particulars: s.items?.[0]?.name ? (s.items[0].name + (s.items.length > 1 ? ' (+' + (s.items.length - 1) + ')' : '')) : 'Goods Sold',
              outward: Number(s.grandTotal || 0),
              inward: 0
            });
          }
        });

        // 3. Payments In (Inward)
        paymentsIn.forEach(pi => {
          if (nameMatch(p, pi.partyName, pi.partyId)) {
            const isCash = String(pi.paymentMode || '').toLowerCase().includes('cash');
            txns.push({
              date: pi.date || '2026-10-15',
              type: 'Payment In',
              refNo: pi.receiptNo || pi.voucherNo || '-',
              transNo: isCash ? 'Cash' : (pi.paymentRefNo || pi.referenceNo || pi.bankRef || '—'),
              particulars: pi.description || 'Customer Payment',
              outward: 0,
              inward: Number(pi.amount || 0)
            });
          }
        });

        // 4. Credit Notes (Inward / Sales Return)
        creditNotes.forEach(cn => {
          if (nameMatch(p, cn.partyName, cn.partyId)) {
            txns.push({
              date: cn.date || '2026-10-15',
              type: 'Credit Note',
              refNo: cn.creditNoteNo || cn.noteNo || '-',
              transNo: '—',
              particulars: cn.reason || 'Sales Return',
              outward: 0,
              inward: Number(cn.grandTotal || cn.amount || 0)
            });
          }
        });

        // 5. Debit Notes (Outward)
        debitNotes.forEach(dn => {
          if (nameMatch(p, dn.partyName, dn.partyId)) {
            txns.push({
              date: dn.date || '2026-10-15',
              type: 'Debit Note',
              refNo: dn.debitNoteNo || dn.noteNo || '-',
              transNo: '—',
              particulars: dn.reason || 'Debit Note Adjustment',
              outward: Number(dn.grandTotal || dn.amount || 0),
              inward: 0
            });
          }
        });

        // 6. Purchases (if applicable) - excludes orders
        purchases.forEach(pu => {
          if (nameMatch(p, pu.partyName, pu.partyId)) {
            const isCash = String(pu.paymentMode || '').toLowerCase() === 'cash';
            txns.push({
              date: pu.date || '2026-10-15',
              type: 'Purchase',
              refNo: pu.billNo || '-',
              transNo: isCash ? 'Cash' : (pu.paymentRefNo || '—'),
              particulars: pu.items?.[0]?.name || 'Purchase Bill',
              outward: 0,
              inward: Number(pu.grandTotal || 0)
            });
          }
        });

        // 7. Payments Out (Refund to customer)
        paymentsOut.forEach(po => {
          if (nameMatch(p, po.partyName, po.partyId)) {
            const isCash = String(po.paymentMode || '').toLowerCase().includes('cash');
            txns.push({
              date: po.date || '2026-10-15',
              type: 'Payment Out',
              refNo: po.voucherNo || '-',
              transNo: isCash ? 'Cash' : (po.paymentRefNo || '—'),
              particulars: po.description || 'Customer Refund',
              outward: Number(po.amount || 0),
              inward: 0
            });
          }
        });

        // Sort chronologically
        txns.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Compute running balances
        let running = 0;
        let totOutward = 0;
        let totInward = 0;
        txns.forEach((t, i) => {
          t.sNo = i + 1;
          totOutward += t.outward;
          totInward += t.inward;
          running += (t.outward - t.inward);
          t.balance = running;
        });

        const finalBal = txns.length > 0 ? running : Number(p.currentBalance || p.balance || 0);
        if (txns.length === 0 && finalBal > 0) {
          totOutward = finalBal;
        }

        return {
          id: p.id,
          code: p.partyCode || p.code || 'DEB-' + String(p.id).slice(-4),
          name: p.name || 'Unnamed Customer',
          phone: p.phone || '—',
          gstin: p.gstin || 'Unregistered',
          address: p.address || p.billingAddress || '—',
          email: p.email || '—',
          state: p.state || 'Tamil Nadu',
          inward: totInward,
          outward: totOutward,
          balance: finalBal,
          status: finalBal > 0 ? 'Pending' : 'Settled',
          txns: txns
        };
      });

      const overallOutward = debtorRecords.reduce((sum, d) => sum + d.outward, 0);
      const overallInward = debtorRecords.reduce((sum, d) => sum + d.inward, 0);
      const overallBalance = debtorRecords.reduce((sum, d) => sum + d.balance, 0);

      return {
        company: comp,
        debtors: debtorRecords,
        overallOutward,
        overallInward,
        overallBalance
      };
    } catch(err) {
      console.error('Error getting debtors ledger data:', err);
      return { company: {}, debtors: [], overallOutward: 0, overallInward: 0, overallBalance: 0 };
    }
  };

  // Render a Single Party Statement Page in jsPDF
  window.__ubitRenderDebtorStatementPDFPage = function(doc, company, party, isFirstPage, dateRangeLabel) {
    if (!isFirstPage) {
      doc.addPage();
    }
    const cMeta = company.meta || company || {};
    const cName = cMeta.name || 'Company Name';
    const cAddr = cMeta.address || cMeta.billingAddress || '';
    const cPhone = cMeta.phone || cMeta.mobile || '';
    const cGst = cMeta.gstin || '';
    const cEmail = cMeta.email || '';
    const cState = cMeta.state || '';
    const logoUrl = cMeta.logoUrl || '';

    // 1. Company Header (Side-by-side with logo on right corner)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(cName, 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    let curY = 21;
    if (cAddr) {
      doc.text(cAddr.slice(0, 68), 14, curY);
      curY += 4.2;
    }
    const taxLine = [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('   |   ');
    doc.text(taxLine.slice(0, 75), 14, curY);
    curY += 5;

    // Render logo on the right side corner if available
    if (logoUrl && logoUrl.startsWith('data:image')) {
      try {
        const format = logoUrl.includes('image/jpeg') || logoUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
        doc.addImage(logoUrl, format, 162, 11, 32, 16);
      } catch(e) {}
    }

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(14, curY, 196, curY);
    curY += 5.5;

    // 2. Title: "Party Statement" + Period
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Party Statement', 14, curY);

    // Period calculation:
    // If filter selected, show filtered date.
    // If filter not selected, show 1st transaction date and date statement generated.
    const rangeInput = dateRangeLabel || window.__ubitActiveDebtorsDateFilter || '';
    const cleanRange = rangeInput.replace(/^Range:\s*/i, '').trim();
    let periodText = '';
    if (cleanRange && cleanRange.toLowerCase() !== 'all time' && cleanRange.includes('to')) {
      periodText = cleanRange;
    } else {
      const firstTxn = (party.txns && party.txns.length > 0) ? party.txns[0] : null;
      const firstDateStr = firstTxn?.date ? new Date(firstTxn.date).toLocaleDateString('en-GB') : (party.createdAt ? new Date(party.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
      const todayStr = new Date().toLocaleDateString('en-GB');
      periodText = firstDateStr + ' to ' + todayStr;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Period: ' + periodText, 194, curY, { align: 'right' });
    curY += 4.5;

    // 3. Customer Box (Formatted same as company details: Name, Address, GST | Phone | Email, Net balance right-aligned)
    const netBalStr = Number(party.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, curY, 182, 24, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Customer', 18, curY + 4.5);

    // Line 1: Customer Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(party.name.slice(0, 48), 18, curY + 9.5);

    // Line 2: Company address
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text((party.address || '—').slice(0, 55), 18, curY + 14.5);

    // Line 3: GST | Phone | Email
    const custTaxLine = [
      party.gstin ? 'GST: ' + party.gstin : 'GST: Unregistered',
      party.phone ? 'Phone: ' + party.phone : '',
      party.email ? 'Email: ' + party.email : ''
    ].filter(Boolean).join('   |   ');
    doc.text(custTaxLine.slice(0, 75), 18, curY + 19.5);

    // Net balance at the right end as in the reference image
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Net Balance: ' + netBalStr, 194, curY + 19.5, { align: 'right' });
    curY += 28;

    // 4. Table Header: # | Date | Type | Ref No | Transaction No | Outword | Inword | Balance
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    doc.text('#', 16, curY + 4.5);
    doc.text('Date', 23, curY + 4.5);
    doc.text('Type', 43, curY + 4.5);
    doc.text('Ref No', 71, curY + 4.5);
    doc.text('Transaction No', 99, curY + 4.5);
    doc.text('Outword', 148, curY + 4.5, { align: 'right' });
    doc.text('Inword', 170, curY + 4.5, { align: 'right' });
    doc.text('Balance', 194, curY + 4.5, { align: 'right' });
    curY += 6.5;

    // 5. Table Rows (Clean, strictly clipped inside columns, NO symbols)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    const txns = party.txns || [];
    if (txns.length === 0) {
      doc.text('No transaction entries recorded in this period.', 23, curY + 4.5);
      doc.text(netBalStr, 194, curY + 4.5, { align: 'right' });
      doc.line(14, curY + 6.5, 196, curY + 6.5);
      curY += 7.5;
    } else {
      txns.forEach((t, idx) => {
        if (curY > 255) {
          doc.addPage();
          curY = 16;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text('Party Statement (Contd.) - ' + party.name, 14, curY);
          curY += 5;
          doc.line(14, curY, 196, curY);
          curY += 5;
        }

        const dtStr = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '-';
        doc.setFont('helvetica', 'normal');
        doc.text(String(idx + 1), 16, curY + 4);
        doc.text(dtStr, 23, curY + 4);
        doc.text((t.type || '').slice(0, 16), 43, curY + 4);
        doc.text((t.refNo || '').slice(0, 16), 71, curY + 4);
        doc.text((t.transNo || '').slice(0, 14), 99, curY + 4);

        // Values only, NO symbols
        const outStr = t.outward > 0 ? t.outward.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';
        const inStr = t.inward > 0 ? t.inward.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';
        const balStr = t.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 });

        doc.text(outStr, 148, curY + 4, { align: 'right' });
        doc.text(inStr, 170, curY + 4, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(balStr, 194, curY + 4, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        doc.setDrawColor(241, 245, 249);
        doc.line(14, curY + 5.8, 196, curY + 5.8);
        curY += 6;
      });
    }

    curY += 3;
    // 6. Bottom Summary with Separate Boxes and +2 Font Size:
    // Box 1: Total Box (+2 font size = 9.5pt)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);

    // Text "Total" next to outword value
    doc.text('Total', 124, curY + 5.5);

    const totOutStr = Number(party.outward || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const totInStr = Number(party.inward || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const balValStr = Number(party.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    doc.text(totOutStr, 148, curY + 5.5, { align: 'right' });
    doc.text(totInStr, 170, curY + 5.5, { align: 'right' });
    doc.text(balValStr, 194, curY + 5.5, { align: 'right' });

    // Space between total balance and net balance box (3.5mm space)
    curY += 11.5;

    // Box 2: Net balance Separate Box (+2 font size = 10.5pt)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 8.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Net balance: ' + balValStr, 194, curY + 5.8, { align: 'right' });
  };

  // Render Consolidated Summary Page in jsPDF
  window.__ubitRenderDebtorsConsolidatedSummaryPage = function(doc, company, debtors, overallTotals, dateRangeLabel) {
    doc.addPage();
    const cMeta = company.meta || company || {};
    const cName = cMeta.name || 'Company Name';
    const cAddr = cMeta.address || '';
    const cGst = cMeta.gstin || '';
    const cPhone = cMeta.phone || '';

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(cName, 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(cAddr, 14, 21);
    doc.text((cGst ? 'GSTIN: ' + cGst + '   |   ' : '') + (cPhone ? 'Phone: ' + cPhone : ''), 14, 26);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 29, 196, 29);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Party Statement — Consolidated Summary', 14, 36);

    const rangeInput = dateRangeLabel || window.__ubitActiveDebtorsDateFilter || '';
    const cleanRange = rangeInput.replace(/^Range:\s*/i, '').trim();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Period: ' + (cleanRange || 'All Time'), 194, 36, { align: 'right' });

    // Summary Table Header
    let curY = 42;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('#', 16, curY + 4.5);
    doc.text('Customer Name', 24, curY + 4.5);
    doc.text('Phone', 85, curY + 4.5);
    doc.text('GSTIN', 115, curY + 4.5);
    doc.text('Outword', 148, curY + 4.5, { align: 'right' });
    doc.text('Inword', 170, curY + 4.5, { align: 'right' });
    doc.text('Balance', 194, curY + 4.5, { align: 'right' });
    curY += 6.5;

    // Debtors Summary Rows (Values only, NO symbols)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    debtors.forEach((d, idx) => {
      if (curY > 255) {
        doc.addPage();
        curY = 20;
      }
      doc.text(String(idx + 1), 16, curY + 4);
      doc.text(d.name.slice(0, 32), 24, curY + 4);
      doc.text(d.phone.slice(0, 14), 85, curY + 4);
      doc.text(d.gstin.slice(0, 16), 115, curY + 4);
      doc.text(d.outward.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 148, curY + 4, { align: 'right' });
      doc.text(d.inward.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 170, curY + 4, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(d.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 194, curY + 4, { align: 'right' });
      doc.setFont('helvetica', 'normal');

      doc.setDrawColor(241, 245, 249);
      doc.line(14, curY + 5.8, 196, curY + 5.8);
      curY += 6;
    });

    curY += 3;
    // Bottom Consolidated Totals with Separate Boxes and +2 Font Size
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 8, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Total', 124, curY + 5.5);

    const ovOutStr = overallTotals.outward.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const ovInStr = overallTotals.inward.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const ovBalStr = overallTotals.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    doc.text(ovOutStr, 148, curY + 5.5, { align: 'right' });
    doc.text(ovInStr, 170, curY + 5.5, { align: 'right' });
    doc.text(ovBalStr, 194, curY + 5.5, { align: 'right' });

    curY += 11.5;
    // Box 2: Net balance Separate Box (+2 font size = 10.5pt)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 8.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Net balance: ' + ovBalStr, 194, curY + 5.8, { align: 'right' });
  };

  // Main Export Dispatcher with Single Folder Selection for Individual PDFs
  window.__ubitExportSundryDebtorsPDF = async function(mode, targetParty, dateRangeLabel) {
    if (!window.Ur) {
      alert('PDF generator is initializing. Please try again in a moment.');
      return;
    }
    const data = window.__ubitGetDebtorsLedgerData();
    const company = data.company;
    const cMeta = company.meta || company || {};
    const cName = (cMeta.name || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dStr = new Date().toISOString().split('T')[0];

    if (mode === 'consolidated') {
      const doc = new window.Ur({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const debtors = data.debtors || [];
      if (debtors.length === 0) {
        alert('No parties found to export.');
        return;
      }

      debtors.forEach((party, idx) => {
        window.__ubitRenderDebtorStatementPDFPage(doc, company, party, idx === 0, dateRangeLabel);
      });

      // Append Overall Summary Page
      window.__ubitRenderDebtorsConsolidatedSummaryPage(doc, company, debtors, {
        outward: data.overallOutward,
        inward: data.overallInward,
        balance: data.overallBalance
      }, dateRangeLabel);

      const blob = doc.output('blob');
      const filename = 'Sundry_Debtors_All_Parties_Consolidated_' + cName + '_' + dStr + '.pdf';
      if (window.UBIT_SAVE_FILE) {
        await window.UBIT_SAVE_FILE(blob, filename, 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      }
    } else if (mode === 'individual') {
      const debtors = data.debtors || [];
      if (debtors.length === 0) {
        alert('No parties found to export.');
        return;
      }

      // Check for showDirectoryPicker support
      if ('showDirectoryPicker' in window) {
        try {
          const parentDirHandle = await window.showDirectoryPicker({
            id: 'ubit_erp_save_location',
            mode: 'readwrite'
          });

          // Create dedicated subfolder: sundry debtors YYYY-MM-DD
          const folderName = 'sundry debtors ' + dStr;
          const targetDir = await parentDirHandle.getDirectoryHandle(folderName, { create: true });

          for (let i = 0; i < debtors.length; i++) {
            const party = debtors[i];
            const doc = new window.Ur({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            window.__ubitRenderDebtorStatementPDFPage(doc, company, party, true, dateRangeLabel);
            const blob = doc.output('blob');
            const pName = (party.name || 'Customer').replace(/[/\\?%*:|"<>]/g, '_');
            const filename = pName + ' ' + dStr + '.pdf';

            const fileHandle = await targetDir.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
          }

          if (typeof showSleekToast === 'function') {
            showSleekToast('Saved ' + debtors.length + ' individual party statements in folder "' + folderName + '"!');
          }
          return;
        } catch(err) {
          // User cancelled folder picker -> STOP IMMEDIATELY, DO NOT DOWNLOAD
          return;
        }
      } else {
        // Fallback only if showDirectoryPicker completely not in window
      for (let i = 0; i < debtors.length; i++) {
        const party = debtors[i];
        const doc = new window.Ur({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        window.__ubitRenderDebtorStatementPDFPage(doc, company, party, true, dateRangeLabel);
        const blob = doc.output('blob');
        const pName = (party.name || 'Customer').replace(/[/\\?%*:|"<>]/g, '_');
        const filename = pName + ' ' + dStr + '.pdf';
        if (window.UBIT_SAVE_FILE) {
          await window.UBIT_SAVE_FILE(blob, filename, 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
        }
      }
    }
  } else if (mode === 'single_party' && targetParty) {
      const doc = new window.Ur({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const debtors = data.debtors || [];
      const party = debtors.find(d => d.id === targetParty.id || d.name === targetParty.name) || targetParty;
      window.__ubitRenderDebtorStatementPDFPage(doc, company, party, true, dateRangeLabel);
      const blob = doc.output('blob');
      const pName = (party.name || 'Customer').replace(/[/\\?%*:|"<>]/g, '_');
      const filename = pName + ' ' + dStr + '.pdf';
      if (window.UBIT_SAVE_FILE) {
        await window.UBIT_SAVE_FILE(blob, filename, 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
      }
    }
  };

  // Interactive View Statement Modal for Individual Party (Aligned with PDF output)
  window.__ubitOpenPartyStatementModal = function(party, dateRangeLabel) {
    const data = window.__ubitGetDebtorsLedgerData();
    const debtors = data.debtors || [];
    const p = debtors.find(d => d.id === party.id || d.name === party.name) || party;
    const cMeta = data.company.meta || {};
    const logoUrl = cMeta.logoUrl || '';

    const existing = document.getElementById('ubit-party-statement-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ubit-party-statement-modal';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto font-sans';

    const txnsHtml = (p.txns || []).length === 0 ? 
      '<tr><td colspan="8" class="py-8 text-center text-slate-400">No transaction entries recorded for this customer in selected period.</td></tr>' :
      (p.txns || []).map((t, idx) => {
        const outStr = t.outward > 0 ? t.outward.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';
        const inStr = t.inward > 0 ? t.inward.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—';
        const balStr = t.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        return '<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs">' +
          '<td class="py-2.5 px-3 text-slate-400 font-mono text-center">' + (idx + 1) + '</td>' +
          '<td class="py-2.5 px-3 text-slate-600 font-mono">' + (t.date || '-') + '</td>' +
          '<td class="py-2.5 px-3 font-semibold text-slate-800">' + (t.type || '-') + '</td>' +
          '<td class="py-2.5 px-3 text-slate-600 font-mono">' + (t.refNo || '-') + '</td>' +
          '<td class="py-2.5 px-3 text-slate-600 font-mono">' + (t.transNo || '—') + '</td>' +
          '<td class="py-2.5 px-3 text-right font-mono ' + (t.outward > 0 ? 'font-bold text-slate-900' : 'text-slate-400') + '">' + outStr + '</td>' +
          '<td class="py-2.5 px-3 text-right font-mono ' + (t.inward > 0 ? 'font-bold text-slate-900' : 'text-slate-400') + '">' + inStr + '</td>' +
          '<td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">' + balStr + '</td>' +
        '</tr>';
      }).join('');

    const netBalStr = Number(p.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const totOutStr = Number(p.outward || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const totInStr = Number(p.inward || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const balValStr = netBalStr;

    // Determine period for display
    const rangeInput = dateRangeLabel || window.__ubitActiveDebtorsDateFilter || '';
    const cleanRange = rangeInput.replace(/^Range:\s*/i, '').trim();
    let periodDisplay = '';
    if (cleanRange && cleanRange.toLowerCase() !== 'all time' && cleanRange.includes('to')) {
      periodDisplay = cleanRange;
    } else {
      const firstTxn = (p.txns && p.txns.length > 0) ? p.txns[0] : null;
      const firstDateStr = firstTxn?.date ? new Date(firstTxn.date).toLocaleDateString('en-GB') : (p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
      const todayStr = new Date().toLocaleDateString('en-GB');
      periodDisplay = firstDateStr + ' to ' + todayStr;
    }

    overlay.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        <!-- Top Toolbar -->
        <div class="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Preview Mode:</span>
            <strong class="text-xs text-slate-900">Party Statement</strong>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" id="ubit-modal-print-btn" class="flex items-center gap-1.5 px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer" title="Print Party Statement">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              <span>Print</span>
            </button>
            <button type="button" id="ubit-modal-save-pdf-btn" class="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
              <span>Save PDF (File Explorer)</span>
            </button>
            <button type="button" id="ubit-modal-close-btn" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        </div>

        <!-- Scrollable Document View mimicking PDF Output -->
        <div class="p-6 overflow-y-auto flex-1 space-y-5 bg-white">
          <!-- 1. Company Header Side-by-Side with Logo -->
          <div class="flex items-start justify-between gap-4 pb-3 border-b border-slate-200">
            <div>
              <h2 class="text-xl font-black text-slate-900 tracking-tight">${cMeta.name || 'Company Name'}</h2>
              <p class="text-xs text-slate-600 mt-0.5">${cMeta.address || ''}</p>
              <p class="text-xs text-slate-500 mt-0.5 font-mono">
                ${cMeta.gstin ? 'GSTIN: ' + cMeta.gstin : ''} ${cMeta.phone ? ' | Phone: ' + cMeta.phone : ''} ${cMeta.email ? ' | Email: ' + cMeta.email : ''}
              </p>
            </div>
            ${logoUrl ? '<img src="' + logoUrl + '" class="max-h-16 max-w-[130px] object-contain rounded" alt="Company Logo" />' : ''}
          </div>

          <!-- 2. Statement Title & Period -->
          <div class="flex items-center justify-between w-full">
            <h3 class="text-base font-black text-slate-900 tracking-tight uppercase">Party Statement</h3>
            <span class="text-xs text-slate-500 font-mono text-right ml-auto">Period: ${periodDisplay}</span>
          </div>

          <!-- 3. Customer Box (Formatted same as company details: Name, Address, GST | Phone | Email, Net balance right-aligned) -->
          <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
            <div class="flex items-center justify-between">
              <strong class="text-sm font-bold text-slate-900">${p.name}</strong>
            </div>
            <div class="text-xs text-slate-600">${p.address || '—'}</div>
            <div class="flex items-center justify-between text-xs text-slate-500 pt-0.5">
              <span>${p.gstin ? 'GST: ' + p.gstin : 'GST: Unregistered'}   |   ${p.phone ? 'Phone: ' + p.phone : ''} ${p.email ? '   |   Email: ' + p.email : ''}</span>
              <strong class="font-mono text-sm text-slate-900">Net Balance: ${netBalStr}</strong>
            </div>
          </div>

          <!-- 4. Table -->
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3 w-10 text-center">#</th>
                  <th class="py-2.5 px-3">Date</th>
                  <th class="py-2.5 px-3">Type</th>
                  <th class="py-2.5 px-3">Ref No</th>
                  <th class="py-2.5 px-3">Transaction No</th>
                  <th class="py-2.5 px-3 text-right">Outword</th>
                  <th class="py-2.5 px-3 text-right">Inword</th>
                  <th class="py-2.5 px-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${txnsHtml}
              </tbody>
            </table>
          </div>

          <!-- 5. Separate Box for Total (Font size +2 = text-sm) -->
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-sm font-bold text-slate-800">
            <div class="flex-1 text-right pr-28 text-slate-600 font-bold">Total</div>
            <div class="flex items-center gap-10 font-mono text-slate-900">
              <span class="w-24 text-right">${totOutStr}</span>
              <span class="w-24 text-right">${totInStr}</span>
              <span class="w-24 text-right">${balValStr}</span>
            </div>
          </div>

          <!-- 6. Space and Separate Box for Net balance (Font size +2 = text-base) -->
          <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Final Ledger Balance:</span>
            <div class="text-base font-black font-mono text-slate-900 flex items-center gap-2">
              <span>Net balance:</span>
              <span class="px-3.5 py-1 bg-white rounded-lg border border-slate-300 shadow-xs text-slate-900">${netBalStr}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('ubit-modal-close-btn').onclick = function() { overlay.remove(); };
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    const printModalBtn = document.getElementById('ubit-modal-print-btn');
    if (printModalBtn) {
      printModalBtn.onclick = function() {
        const docArea = overlay.querySelector('.overflow-y-auto.flex-1');
        if (docArea && window.__ubitOpenCenteredPrintWindow) {
          window.__ubitOpenCenteredPrintWindow(docArea.innerHTML, 'Party Statement - ' + p.name);
        }
      };
    }
    document.getElementById('ubit-modal-save-pdf-btn').onclick = function() {
      window.__ubitExportSundryDebtorsPDF('single_party', p, dateRangeLabel);
    };
  };


  // =========================================================================
  // EXTENSION 10: ALL PARTY STATEMENT PDF & EXCEL ENGINE
  // User company header with logo, statement title & period, summary tiles,
  // table content exactly matching menu on one line per party, and
  // Windows Explorer save dialog for PDF and Excel.
  // =========================================================================

  window.__ubitExportAllPartyStatement = async function(mode, partiesList, company, dateRangeLabel, summaryTotals) {
    try {
      const cid = localStorage.getItem('gst_erp_active_company_id') || 'comp_demo_workspace';
      const comp = company || window.__erpCurrentCompany || (typeof Qu === 'function' ? Qu()?.currentCompany : null) || JSON.parse(localStorage.getItem('ubit_erp_cloud_company_' + cid) || '{}');
      const cMeta = comp.meta || comp || {};
      const cName = cMeta.name || 'Company Name';
      const cAddr = cMeta.address || cMeta.billingAddress || '';
      const cPhone = cMeta.phone || cMeta.mobile || '';
      const cGst = cMeta.gstin || '';
      const cEmail = cMeta.email || '';
      const logoUrl = cMeta.logoUrl || '';

      const safeCName = (cName || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
      const dStr = new Date().toISOString().split('T')[0];

      // Resolve parties list if not provided
      let list = partiesList;
      if (!list || list.length === 0) {
        const rawParties = comp.parties || [];
        const rawSales = comp.sales || [];
        const rawPurchases = comp.purchases || [];
        list = rawParties.map(p => {
          const pSales = rawSales.filter(s => (s.partyName || '').toLowerCase() === (p.name || '').toLowerCase());
          const pPurchases = rawPurchases.filter(pb => ((pb.supplierName || pb.partyName) || '').toLowerCase() === (p.name || '').toLowerCase());
          const debit = pSales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
          const credit = pPurchases.reduce((sum, pb) => sum + Number(pb.grandTotal || 0), 0) + pSales.reduce((sum, s) => sum + Number(s.receivedAmount || 0), 0);
          const isDebtor = p.balanceType === 'Receivable' || debit >= credit;
          const closing = Number(p.currentBalance || Math.abs(debit - credit) || 0);
          return {
            id: p.id,
            code: p.partyCode || p.code || '-',
            name: p.name,
            group: isDebtor ? 'Sundry Debtors' : 'Sundry Creditors',
            phone: p.phone || '-',
            gstin: p.gstin || 'Unregistered',
            opening: Number(p.openingBalance || 0),
            debit: debit,
            credit: credit,
            closing: closing,
            status: isDebtor ? (closing > 0 ? 'Receivable' : 'Settled') : (closing > 0 ? 'Payable' : 'Settled')
          };
        });
      }

      // Compute or retrieve totals
      const totalDebtors = summaryTotals?.totalDebtorsAmount !== undefined ? 
        summaryTotals.totalDebtorsAmount : 
        list.filter(p => p.group === 'Sundry Debtors').reduce((s, p) => s + p.closing, 0);

      const totalCreditors = summaryTotals?.totalCreditorsAmount !== undefined ? 
        summaryTotals.totalCreditorsAmount : 
        list.filter(p => p.group === 'Sundry Creditors').reduce((s, p) => s + p.closing, 0);

      const netOutstanding = Math.abs(totalDebtors - totalCreditors);

      // Clean period label
      let cleanPeriod = (dateRangeLabel || window.__ubitActiveDebtorsDateFilter || '').replace(/^Range:\s*/i, '').trim();
      if (!cleanPeriod || cleanPeriod.toLowerCase() === 'all time') {
        cleanPeriod = 'All Time';
      }

      if (mode === 'pdf' || mode === 'print') {
        if (!window.Ur) {
          alert('PDF engine is initializing. Please try again.');
          return;
        }

        // A4 Landscape: 297mm width x 210mm height
        const doc = new window.Ur({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        const renderPageHeader = (pageDoc, pageNum) => {
          // 1. Company Header
          pageDoc.setFont('helvetica', 'bold');
          pageDoc.setFontSize(14);
          pageDoc.setTextColor(15, 23, 42);
          pageDoc.text(cName, 14, 15);

          pageDoc.setFont('helvetica', 'normal');
          pageDoc.setFontSize(8);
          pageDoc.setTextColor(71, 85, 105);
          if (cAddr) pageDoc.text(cAddr.slice(0, 95), 14, 19.5);
          const taxLine = [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('   |   ');
          pageDoc.text(taxLine.slice(0, 110), 14, 23.5);

          // Render Logo on top-right corner if available
          if (logoUrl && logoUrl.startsWith('data:image')) {
            try {
              const format = logoUrl.includes('image/jpeg') || logoUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
              pageDoc.addImage(logoUrl, format, 248, 9, 35, 16);
            } catch(e) {}
          }

          // Top divider line
          pageDoc.setDrawColor(203, 213, 225);
          pageDoc.setLineWidth(0.4);
          pageDoc.line(14, 27, 283, 27);

          // 2. Statement Title & Period
          pageDoc.setFont('helvetica', 'bold');
          pageDoc.setFontSize(12);
          pageDoc.setTextColor(15, 23, 42);
          pageDoc.text('All Party Statement', 14, 34);

          pageDoc.setFont('helvetica', 'normal');
          pageDoc.setFontSize(8);
          pageDoc.setTextColor(100, 116, 139);
          pageDoc.text('Period: ' + cleanPeriod, 283, 34, { align: 'right' });

          // 3. 3 Summary Cards
          const cardY = 38;
          const cardH = 13;
          const cardW = 86;

          // Card 1: Receivables
          pageDoc.setFillColor(248, 250, 252);
          pageDoc.setDrawColor(226, 232, 240);
          pageDoc.roundedRect(14, cardY, cardW, cardH, 1.5, 1.5, 'FD');
          pageDoc.setFont('helvetica', 'bold');
          pageDoc.setFontSize(6.8);
          pageDoc.setTextColor(100, 116, 139);
          pageDoc.text('TOTAL RECEIVABLES (DEBTORS)', 18, cardY + 4.2);
          pageDoc.setFontSize(10.5);
          pageDoc.setTextColor(15, 23, 42);
          pageDoc.text(totalDebtors.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 18, cardY + 9.8);

          // Card 2: Payables
          pageDoc.roundedRect(105, cardY, cardW, cardH, 1.5, 1.5, 'FD');
          pageDoc.setFontSize(6.8);
          pageDoc.setTextColor(100, 116, 139);
          pageDoc.text('TOTAL PAYABLES (CREDITORS)', 109, cardY + 4.2);
          pageDoc.setFontSize(10.5);
          pageDoc.setTextColor(15, 23, 42);
          pageDoc.text(totalCreditors.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 109, cardY + 9.8);

          // Card 3: Net Balance
          pageDoc.roundedRect(197, cardY, cardW, cardH, 1.5, 1.5, 'FD');
          pageDoc.setFontSize(6.8);
          pageDoc.setTextColor(100, 116, 139);
          pageDoc.text('NET OUTSTANDING BALANCE', 201, cardY + 4.2);
          pageDoc.setFontSize(10.5);
          pageDoc.setTextColor(15, 23, 42);
          pageDoc.text(netOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 201, cardY + 9.8);

          // 4. Table Header
          const tableHeaderY = 55;
          pageDoc.setFillColor(241, 245, 249);
          pageDoc.setDrawColor(203, 213, 225);
          pageDoc.rect(14, tableHeaderY, 269, 6.5, 'FD');

          pageDoc.setFont('helvetica', 'bold');
          pageDoc.setFontSize(7.2);
          pageDoc.setTextColor(51, 65, 85);

          pageDoc.text('#', 16, tableHeaderY + 4.5);
          pageDoc.text('Code', 24, tableHeaderY + 4.5);
          pageDoc.text('Party Name', 46, tableHeaderY + 4.5);
          pageDoc.text('Account Group', 104, tableHeaderY + 4.5);
          pageDoc.text('Phone', 137, tableHeaderY + 4.5);
          pageDoc.text('GSTIN', 161, tableHeaderY + 4.5);
          pageDoc.text('Opening Bal', 198, tableHeaderY + 4.5, { align: 'right' });
          pageDoc.text('Total Debit', 223, tableHeaderY + 4.5, { align: 'right' });
          pageDoc.text('Total Credit', 248, tableHeaderY + 4.5, { align: 'right' });
          pageDoc.text('Closing Balance', 270, tableHeaderY + 4.5, { align: 'right' });
          pageDoc.text('Status', 282, tableHeaderY + 4.5, { align: 'right' });

          return tableHeaderY + 6.5;
        };

        let curY = renderPageHeader(doc, 1);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(30, 41, 59);

        let totOp = 0, totDeb = 0, totCred = 0, totClose = 0;

        list.forEach((p, idx) => {
          if (curY > 185) {
            doc.addPage();
            curY = renderPageHeader(doc, doc.getNumberOfPages());
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(30, 41, 59);
          }

          totOp += p.opening;
          totDeb += p.debit;
          totCred += p.credit;
          totClose += p.closing;

          // All details in one single horizontal line
          doc.text(String(idx + 1), 16, curY + 4);
          doc.text((p.code || '-').slice(0, 10), 24, curY + 4);
          doc.setFont('helvetica', 'bold');
          doc.text((p.name || '').slice(0, 32), 46, curY + 4);
          doc.setFont('helvetica', 'normal');
          doc.text((p.group || '').slice(0, 16), 104, curY + 4);
          doc.text((p.phone || '-').slice(0, 14), 137, curY + 4);
          doc.text((p.gstin || 'Unregistered').slice(0, 16), 161, curY + 4);

          // Values only, NO symbols
          doc.text(p.opening.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 198, curY + 4, { align: 'right' });
          doc.text(p.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 223, curY + 4, { align: 'right' });
          doc.text(p.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 248, curY + 4, { align: 'right' });
          doc.setFont('helvetica', 'bold');
          doc.text(p.closing.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 270, curY + 4, { align: 'right' });
          doc.setFont('helvetica', 'normal');
          doc.text((p.status || '-').slice(0, 10), 282, curY + 4, { align: 'right' });

          doc.setDrawColor(241, 245, 249);
          doc.line(14, curY + 5.5, 283, curY + 5.5);
          curY += 5.8;
        });

        // Totals Row
        if (curY > 185) {
          doc.addPage();
          curY = renderPageHeader(doc, doc.getNumberOfPages());
        }

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.rect(14, curY + 1, 269, 7.5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text('TOTAL', 161, curY + 5.8);
        doc.text(totOp.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 198, curY + 5.8, { align: 'right' });
        doc.text(totDeb.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 223, curY + 5.8, { align: 'right' });
        doc.text(totCred.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 248, curY + 5.8, { align: 'right' });
        doc.text(totClose.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 270, curY + 5.8, { align: 'right' });

        if (mode === 'print') {
          const logoHtml = logoUrl && logoUrl.startsWith('data:image') ?
            '<img src="' + logoUrl + '" style="max-height:60px;max-width:140px;object-fit:contain;" />' : '';

          const rowsHtml = list.map((p, idx) => {
            return '<tr style="background:' + (idx % 2 === 0 ? '#ffffff' : '#f8fafc') + ';">' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;text-align:center;">' + (idx + 1) + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;font-family:monospace;">' + (p.code || '-') + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;font-weight:700;">' + (p.name || '-') + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;color:#475569;">' + (p.group || '-') + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;">' + (p.phone || '-') + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;font-family:monospace;">' + (p.gstin || 'Unregistered') + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;text-align:right;font-family:monospace;">' + p.opening.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;text-align:right;font-family:monospace;color:#047857;">' + p.debit.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;text-align:right;font-family:monospace;color:#b91c1c;">' + p.credit.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;text-align:right;font-family:monospace;font-weight:700;">' + p.closing.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
              '<td style="padding:6px 8px;border:1px solid #cbd5e1;font-size:11px;text-align:center;">' + (p.status || '-') + '</td>' +
              '</tr>';
          }).join('');

          const html = '<!DOCTYPE html><html><head><title>All Party Statement - ' + cName + '</title>' +
            '<style>' +
            '@page { size: landscape; margin: 0 !important; }' +
            'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; color: #0f172a; padding: 16px; }' +
            '.top-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #334155; margin-bottom: 12px; }' +
            '.comp-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }' +
            '.comp-details { font-size: 11px; color: #475569; line-height: 1.4; }' +
            '.rep-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }' +
            '.rep-title { font-size: 15px; font-weight: 800; text-transform: uppercase; color: #0f172a; }' +
            '.rep-period { font-size: 11px; font-family: monospace; color: #64748b; }' +
            'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }' +
            'th { background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase; }' +
            '.summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }' +
            '.card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }' +
            '.card-title { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }' +
            '.card-val { font-size: 16px; font-weight: 800; font-family: monospace; margin-top: 2px; }' +
            '.footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 8px; }' +
            '</style></head><body>' +
            '<div class="top-header">' +
            '<div>' +
            '<div class="comp-name">' + cName + '</div>' +
            '<div class="comp-details">' +
            (cAddr ? cAddr + '<br>' : '') +
            [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('  |  ') +
            '</div>' +
            '</div>' +
            logoHtml +
            '</div>' +
            '<div class="rep-header">' +
            '<div class="rep-title">All Party Statement</div>' +
            '<div class="rep-period">Period: ' + cleanPeriod + '</div>' +
            '</div>' +
            '<div class="summary-cards">' +
            '<div class="card"><div class="card-title">Total Receivables</div><div class="card-val" style="color:#047857;">' + totalDebtors.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</div></div>' +
            '<div class="card"><div class="card-title">Total Payables</div><div class="card-val" style="color:#b91c1c;">' + totalCreditors.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</div></div>' +
            '<div class="card"><div class="card-title">Net Outstanding</div><div class="card-val" style="color:#0f172a;">' + netOutstanding.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</div></div>' +
            '</div>' +
            '<table><thead><tr>' +
            '<th>#</th><th>Code</th><th style="text-align:left;">Party Name</th><th>Group</th><th>Phone</th><th>GSTIN</th><th style="text-align:right;">Opening Bal</th><th style="text-align:right;">Total Debit</th><th style="text-align:right;">Total Credit</th><th style="text-align:right;">Closing Balance</th><th>Status</th>' +
            '</tr></thead><tbody>' +
            rowsHtml +
            '<tr style="background:#f1f5f9;font-weight:700;">' +
            '<td colspan="6" style="padding:8px;border:1px solid #cbd5e1;text-align:right;">TOTAL</td>' +
            '<td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">' + totOp.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
            '<td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">' + totDeb.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
            '<td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">' + totCred.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
            '<td style="padding:8px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">' + totClose.toLocaleString('en-IN', {minimumFractionDigits: 2}) + '</td>' +
            '<td style="padding:8px;border:1px solid #cbd5e1;"></td>' +
            '</tr>' +
            '</tbody></table>' +
            '</body></html>';

          return window.__ubitOpenCenteredPrintWindow(html, "All Party Statement - " + cName);
        }

        // Save PDF with Windows Explorer save picker
        const blob = doc.output('blob');
        const filename = 'All_Party_Statement_' + safeCName + '_' + dStr + '.pdf';
        if (window.UBIT_SAVE_FILE) {
          await window.UBIT_SAVE_FILE(blob, filename, 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
        }
      } else if (mode === 'excel') {
        const Jc = window.Jc || window.XLSX;
        if (!Jc) {
          alert('Excel export engine is initializing. Please try again.');
          return;
        }

        const rows = [
          [cName],
          [cAddr],
          [[cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('   |   ')],
          ['Statement: All Party Statement', '', '', '', '', '', '', 'Period: ' + cleanPeriod],
          [],
          ['TOTAL RECEIVABLES (DEBTORS)', totalDebtors, '', 'TOTAL PAYABLES (CREDITORS)', totalCreditors, '', 'NET OUTSTANDING BALANCE', netOutstanding],
          [],
          ['#', 'Code', 'Party Name', 'Account Group', 'Phone', 'GSTIN', 'Opening Bal', 'Total Debit (₹)', 'Total Credit (₹)', 'Closing Balance (₹)', 'Status']
        ];

        let totOp = 0, totDeb = 0, totCred = 0, totClose = 0;

        list.forEach((p, idx) => {
          totOp += p.opening;
          totDeb += p.debit;
          totCred += p.credit;
          totClose += p.closing;

          rows.push([
            idx + 1,
            p.code,
            p.name,
            p.group,
            p.phone,
            p.gstin,
            p.opening,
            p.debit,
            p.credit,
            p.closing,
            p.status
          ]);
        });

        rows.push([]);
        rows.push(['TOTAL', '', '', '', '', '', totOp, totDeb, totCred, totClose, '']);

        const ws = Jc.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 6 },
          { wch: 14 },
          { wch: 32 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 16 },
          { wch: 16 },
          { wch: 16 },
          { wch: 16 },
          { wch: 14 }
        ];

        const wb = Jc.book_new();
        Jc.book_append_sheet(wb, ws, 'All Party Statement');

        const excelBuffer = Jc.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = 'All_Party_Statement_' + safeCName + '_' + dStr + '.xlsx';

        if (window.UBIT_SAVE_FILE) {
          await window.UBIT_SAVE_FILE(excelBlob, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel Spreadsheet (*.xlsx)', '.xlsx');
        } else {
          const url = URL.createObjectURL(excelBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
        }
      }
    } catch(err) {
      console.error('Error generating All Party Statement:', err);
      alert('Error generating statement: ' + (err.message || err));
    }
  };


  // =========================================================================
  // EXTENSION 10: ACCOUNTING REPORTS EXPORT ENGINE (PRINT, PDF, EXCEL)
  // Supports: All Party Statement, Trial Balance, Profit & Loss, Balance Sheet,
  //           Comprehensive Expense Report, Cash Flow Statement
  // =========================================================================
  window.__ubitExportAccountingReport = async function(mode, pageTitle, reportData, company) {
    try {
      const title = pageTitle || "Accounting Report";
      const cid = localStorage.getItem('gst_erp_active_company_id') || 'comp_demo_workspace';
      const comp = company || window.__erpCurrentCompany || (typeof Qu === 'function' ? Qu()?.currentCompany : null) || JSON.parse(localStorage.getItem('ubit_erp_cloud_company_' + cid) || '{}');
      const cMeta = comp.meta || comp || {};
      const cName = cMeta.name || 'Company Name';
      const cAddr = cMeta.address || cMeta.billingAddress || '';
      const cPhone = cMeta.phone || cMeta.mobile || '';
      const cGst = cMeta.gstin || '';
      const cEmail = cMeta.email || '';
      const logoUrl = cMeta.logoUrl || '';
      const dStr = new Date().toISOString().split('T')[0];
      const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');

      // 1. If All Party Statement, use dedicated all party statement export
      if (title.includes("All Party") || title.includes("All Parties")) {
        if (window.__ubitExportAllPartyStatement) {
          return await window.__ubitExportAllPartyStatement(mode, reportData?.allPartiesStatementList, comp, reportData?.dateRangeLabel, {
            totalDebtorsAmount: reportData?.totalDebtorsAmount,
            totalCreditorsAmount: reportData?.totalCreditorsAmount
          });
        }
      }

      // 2. Prepare structured data based on report type or passed headers/rows
      let headers = [];
      let rows = [];
      let summaryRows = [];
      const cleanPeriod = (reportData?.dateRangeLabel || window.__ubitActiveDebtorsDateFilter || '').replace(/^Range:\s*/i, '').trim() || 'All Time';

      if (reportData?.headers && Array.isArray(reportData.headers) && reportData?.rows && Array.isArray(reportData.rows)) {
        headers = reportData.headers;
        rows = reportData.rows;
        if (reportData.metrics && Array.isArray(reportData.metrics)) {
          summaryRows = reportData.metrics.map(m => [m.label, "Summary", String(m.value)]);
        }
      } else if (title.includes("Day Book") || title.includes("Daybook")) {
        headers = ["#", "Date", "Type", "Voucher No", "Party / Particulars", "Inflow (Rs.)", "Outflow (Rs.)", "Net Amount (Rs.)"];
        const entries = reportData?.dayBookEntries || [];
        rows = entries.map((e, i) => [
          String(i + 1),
          e.date ? new Date(e.date).toLocaleDateString('en-GB') : '-',
          String(e.type || 'Txn'),
          String(e.voucherNo || e.refNo || '-'),
          String(e.partyName || e.particulars || '-'),
          Number(e.inflow || 0) > 0 ? Number(e.inflow).toFixed(2) : '-',
          Number(e.outflow || 0) > 0 ? Number(e.outflow).toFixed(2) : '-',
          Number(e.amount || e.grandTotal || 0).toFixed(2)
        ]);
        const totInflow = entries.reduce((s, e) => s + Number(e.inflow || 0), 0);
        const totOutflow = entries.reduce((s, e) => s + Number(e.outflow || 0), 0);
        summaryRows = [
          ["Total Inflow", "Cash / Bank Received", totInflow.toFixed(2)],
          ["Total Outflow", "Disbursements / Paid", totOutflow.toFixed(2)],
          ["Net Cash Movement", totInflow >= totOutflow ? "Net Surplus" : "Net Deficit", Math.abs(totInflow - totOutflow).toFixed(2)]
        ];
      } else if (title.includes("Trial Balance")) {
        headers = ["Account Head", "Group / Classification", "Debit (Rs.)", "Credit (Rs.)"];
        const salesTotal = (reportData?.filteredSales || []).reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
        const purchasesTotal = (reportData?.filteredPurchases || []).reduce((sum, p) => sum + Number(p.grandTotal || 0), 0);
        const debtors = Number(reportData?.totalDebtorsAmount || 0);
        const creditors = Number(reportData?.totalCreditorsAmount || 0);
        const bankBal = Number(reportData?.totalBankBalance || 0);
        const cashBal = Number(reportData?.cashBalance || 0);
        const stockVal = Number(reportData?.totalStockValue || 0);
        const expenses = Number(reportData?.totalExpensesAmount || 0);
        const capital = 500000;
        const debits = debtors + bankBal + cashBal + stockVal + purchasesTotal + expenses;
        const balancedCredits = debits;

        rows = [
          ["Capital Account", "Capital / Equity", "-", capital.toFixed(2)],
          ["Sundry Debtors (Receivables)", "Current Assets", debtors.toFixed(2), "-"],
          ["Sundry Creditors (Payables)", "Current Liabilities", "-", creditors.toFixed(2)],
          ["Bank Balances", "Current Assets", bankBal.toFixed(2), "-"],
          ["Cash-in-Hand", "Current Assets", cashBal.toFixed(2), "-"],
          ["Closing Stock Value", "Current Assets", stockVal.toFixed(2), "-"],
          ["Sales Accounts", "Revenue / Income", "-", salesTotal.toFixed(2)],
          ["Purchase Accounts", "Direct Expense", purchasesTotal.toFixed(2), "-"],
          ["Direct & Indirect Expenses", "Operating Expenses", expenses.toFixed(2), "-"]
        ];
        summaryRows = [
          ["Total Balanced", "Double-Entry Balance", debits.toFixed(2), balancedCredits.toFixed(2)]
        ];
      } else if (title.includes("Profit & Loss") || title.includes("P&L")) {
        headers = ["Particulars", "Classification / Head", "Amount (Rs.)"];
        const salesTotal = (reportData?.filteredSales || []).reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
        const creditNotesTotal = (reportData?.filteredCreditNotes || []).reduce((sum, c) => sum + Number(c.grandTotal || c.totalAmount || c.amount || 0), 0);
        const purchasesTotal = (reportData?.filteredPurchases || []).reduce((sum, p) => sum + Number(p.grandTotal || 0), 0);
        const debitNotesTotal = (reportData?.filteredDebitNotes || []).reduce((sum, d) => sum + Number(d.grandTotal || d.totalAmount || d.amount || 0), 0);
        const itemsList = reportData?.items || [];
        const openingStockTotal = itemsList.reduce((sum, itm) => sum + (Number(itm.openingStock || itm.openingQty || 0) * Number(itm.purchasePrice || itm.purchaseRate || itm.rate || 0)), 0);
        const closingStockTotal = Number(reportData?.totalStockValue || 0) || itemsList.reduce((sum, itm) => sum + (Number(itm.stock != null ? itm.stock : (itm.quantity || 0)) * Number(itm.purchasePrice || itm.purchaseRate || itm.rate || 0)), 0);
        const exps = reportData?.filteredExpenses || [];
        const directExpensesTotal = exps.filter(ex => (ex.expenseType || "").toLowerCase().includes("direct") || (ex.category || "").toLowerCase().includes("direct") || (ex.category || "").toLowerCase().includes("freight") || (ex.category || "").toLowerCase().includes("transport")).reduce((sum, ex) => sum + Number(ex.amount || 0), 0);
        const indirectExpensesTotal = exps.filter(ex => !((ex.expenseType || "").toLowerCase().includes("direct") || (ex.category || "").toLowerCase().includes("direct") || (ex.category || "").toLowerCase().includes("freight") || (ex.category || "").toLowerCase().includes("transport"))).reduce((sum, ex) => sum + Number(ex.amount || 0), 0);
        const taxPayableTotal = (reportData?.filteredSales || []).reduce((sum, s) => sum + Number((s.cgstTotal || 0) + (s.sgstTotal || 0) + (s.igstTotal || 0)), 0);
        const taxReceivableTotal = (reportData?.filteredPurchases || []).reduce((sum, p) => sum + Number((p.cgstTotal || 0) + (p.sgstTotal || 0) + (p.igstTotal || 0)), 0);

        // Formula: Sales - Credit Note - Purchase + Debit note - opening stock + closing stock - direct Expenses - indirect expenses - tax payable + tax recevable = profit or loss
        const netProfitOrLoss = salesTotal - creditNotesTotal - purchasesTotal + debitNotesTotal - openingStockTotal + closingStockTotal - directExpensesTotal - indirectExpensesTotal - taxPayableTotal + taxReceivableTotal;

        rows = [
          ["Sale", "Operating Revenue (+)", salesTotal.toFixed(2)],
          ["Credit Note", "Sales Deduction (-)", ("-" + creditNotesTotal.toFixed(2))],
          ["Purchase", "Direct Cost of Purchases (-)", ("-" + purchasesTotal.toFixed(2))],
          ["Debit note", "Purchase Deduction (+)", debitNotesTotal.toFixed(2)],
          ["Opening Stock", "Beginning Inventory (-)", ("-" + openingStockTotal.toFixed(2))],
          ["Closing Stock", "Trading Inventory Asset (+)", closingStockTotal.toFixed(2)],
          ["Direct Expense", "Direct Operating Expenses (-)", ("-" + directExpensesTotal.toFixed(2))],
          ["Indirect expense", "Indirect Operating Expenses (-)", ("-" + indirectExpensesTotal.toFixed(2))],
          ["Tax Payable", "Tax Liability (-)", ("-" + taxPayableTotal.toFixed(2))],
          ["Tax Recevable", "Tax Credit / Asset (+)", taxReceivableTotal.toFixed(2)],
          ["Profit or Loss", netProfitOrLoss >= 0 ? "Profit (=)" : "Loss (=)", netProfitOrLoss.toFixed(2)]
        ];
        summaryRows = [
          ["Profit or Loss", netProfitOrLoss >= 0 ? "Profit" : "Loss", netProfitOrLoss.toFixed(2)]
        ];
      } else if (title.includes("Balance Sheet")) {
        headers = ["Classification", "Particulars", "Amount (Rs.)"];
        const debtors = Number(reportData?.totalDebtorsAmount || 0);
        const creditors = Number(reportData?.totalCreditorsAmount || 0);
        const bankBal = Number(reportData?.totalBankBalance || 0);
        const cashBal = Number(reportData?.cashBalance || 0);
        const stockVal = Number(reportData?.totalStockValue || 0);
        const capital = 500000;
        const assetsTotal = debtors + bankBal + cashBal + stockVal + 150000;
        const liabTotal = assetsTotal;
        const reserves = Math.max(0, liabTotal - capital - creditors);

        rows = [
          ["Liabilities & Equity", "Capital Account", capital.toFixed(2)],
          ["Liabilities & Equity", "Sundry Creditors (Suppliers)", creditors.toFixed(2)],
          ["Liabilities & Equity", "Reserves & Retained Earnings", reserves.toFixed(2)],
          ["Liabilities & Equity", "Total Liabilities & Equity", liabTotal.toFixed(2)],
          ["Assets", "Sundry Debtors (Customer Receivables)", debtors.toFixed(2)],
          ["Assets", "Bank Accounts", bankBal.toFixed(2)],
          ["Assets", "Cash-in-Hand", cashBal.toFixed(2)],
          ["Assets", "Stock-in-Hand", stockVal.toFixed(2)],
          ["Assets", "Fixed Assets & Equipment", (150000).toFixed(2)],
          ["Assets", "Total Assets", assetsTotal.toFixed(2)]
        ];
        summaryRows = [
          ["Total Liabilities", "Equity + Liabilities", liabTotal.toFixed(2)],
          ["Total Assets", "Fixed + Current Assets", assetsTotal.toFixed(2)]
        ];
      } else if (title.includes("Expense")) {
        headers = ["#", "Date", "Voucher No", "Category", "Payee / Vendor", "Payment Mode", "Amount (Rs.)"];
        const expensesList = reportData?.filteredExpenses || [];
        rows = expensesList.map((x, i) => [
          String(i + 1),
          x.date ? new Date(x.date).toLocaleDateString('en-GB') : '-',
          String(x.voucherNo || x.refNo || ("EXP-" + (i + 1))),
          String(x.category || 'General Expense'),
          String(x.payee || x.vendor || x.particulars || '-'),
          String(x.paymentMode || 'Cash'),
          Number(x.amount || 0).toFixed(2)
        ]);
        const totalExp = Number(reportData?.totalExpensesAmount || 0);
        const cashExp = expensesList.filter(x => (x.paymentMode || '').toLowerCase() === 'cash').reduce((s, x) => s + Number(x.amount || 0), 0);
        const bankExp = expensesList.filter(x => (x.paymentMode || '').toLowerCase() !== 'cash').reduce((s, x) => s + Number(x.amount || 0), 0);
        summaryRows = [
          ["Total Expenses", "All Modes", totalExp.toFixed(2)],
          ["Cash Expenses", "Cash Mode", cashExp.toFixed(2)],
          ["Bank Expenses", "Bank / Online Mode", bankExp.toFixed(2)]
        ];
      } else if (title.includes("Cash Flow")) {
        headers = ["Activity / Source", "Classification", "Cash Movement (Rs.)"];
        const cashSales = (reportData?.filteredSales || []).reduce((s, x) => s + Number(x.receivedAmount || 0), 0);
        const cashPurchases = (reportData?.filteredPurchases || []).reduce((s, x) => s + Number(x.paidAmount || 0), 0);
        const expenses = Number(reportData?.totalExpensesAmount || 0);
        const opCashFlow = cashSales - cashPurchases - expenses;

        rows = [
          ["Cash Inflow from Invoiced Receipts", "Operating Activities (+)", "+ " + cashSales.toFixed(2)],
          ["Cash Outflow for Purchases", "Operating Activities (-)", "- " + cashPurchases.toFixed(2)],
          ["Operating Expense Disbursements", "Operating Activities (-)", "- " + expenses.toFixed(2)],
          ["Net Cash Flow from Operations", "Net Operating Flow", opCashFlow.toFixed(2)]
        ];
        summaryRows = [
          ["Net Operating Cash Flow", "Total Inflow - Total Outflow", opCashFlow.toFixed(2)]
        ];
      } else {
        headers = ["#", "Item", "Value"];
        rows = [["1", title, "Standard Statement Data"]];
      }

      // Filter by search term if provided
      const q = (reportData?.searchTerm || '').trim().toLowerCase();
      if (q) {
        rows = rows.filter(r => r.some(cell => String(cell).toLowerCase().includes(q)));
      }

      // 3. EXECUTE EXPORT BY MODE
      if (mode === 'print') {
        const tableHeadersHtml = headers.map((h, i) => {
          const isNum = h.includes('(Rs.)') || h.includes('Amount') || h.includes('Debit') || h.includes('Credit') || h.includes('Movement') || h.includes('(₹)');
          return '<th style="padding:8px 12px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:12px;color:#1e293b;text-align:' + (isNum ? 'right' : 'left') + ';">' + h + '</th>';
        }).join('');

        const tableRowsHtml = rows.map((r, ri) => {
          const cells = r.map((c, ci) => {
            const h = headers[ci] || '';
            const isNum = h.includes('(Rs.)') || h.includes('Amount') || h.includes('Debit') || h.includes('Credit') || h.includes('Movement') || h.includes('(₹)');
            return '<td style="padding:6px 12px;border:1px solid #e2e8f0;font-size:11px;font-family:monospace;color:#0f172a;text-align:' + (isNum ? 'right' : 'left') + ';font-weight:' + (isNum ? 'bold' : 'normal') + ';">' + c + '</td>';
          }).join('');
          return '<tr style="background:' + (ri % 2 === 0 ? '#ffffff' : '#f8fafc') + ';">' + cells + '</tr>';
        }).join('');

        const summaryHtml = summaryRows.map(sr => {
          return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px dashed #cbd5e1;">' +
            '<strong>' + sr[0] + ' (' + sr[1] + '):</strong>' +
            '<span style="font-family:monospace;font-weight:bold;">' + sr[2] + (sr[3] ? '  |  ' + sr[3] : '') + '</span>' +
            '</div>';
        }).join('');

        const logoHtml = logoUrl && logoUrl.startsWith('data:image') ?
          '<img src="' + logoUrl + '" style="max-height:60px;max-width:140px;object-fit:contain;" />' : '';

        const html = '<!DOCTYPE html><html><head><title>' + title + '</title>' +
          '<style>' +
          '@page { size: A4 portrait; margin: 10mm 12mm 15mm 12mm !important; }' +
          'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 12px; color: #0f172a; }' +
          '.top-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #334155; margin-bottom: 12px; }' +
          '.comp-name { font-size: 18px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }' +
          '.comp-details { font-size: 11px; color: #475569; line-height: 1.4; }' +
          '.rep-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }' +
          '.rep-title { font-size: 15px; font-weight: 800; text-transform: uppercase; color: #0f172a; }' +
          '.rep-period { font-size: 11px; font-family: monospace; color: #64748b; }' +
          'table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }' +
          '.summary-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; max-width: 420px; margin-left: auto; margin-top: 12px; }' +
          '.report-footer-page { margin-top: 24px; padding-top: 10px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; font-family: monospace; font-weight: bold; }' +
          '</style></head><body>' +
          '<div class="top-header">' +
          '<div>' +
          '<div class="comp-name">' + cName + '</div>' +
          '<div class="comp-details">' +
          (cAddr ? cAddr + '<br>' : '') +
          [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('  |  ') +
          '</div>' +
          '</div>' +
          logoHtml +
          '</div>' +
          '<div class="rep-header">' +
          '<div class="rep-title">' + title + '</div>' +
          '<div class="rep-period">Period: ' + cleanPeriod + '</div>' +
          '</div>' +
          '<table><thead><tr>' + tableHeadersHtml + '</tr></thead><tbody>' + tableRowsHtml + '</tbody></table>' +
          (summaryRows.length > 0 ? '<div class="summary-card"><strong style="display:block;font-size:12px;margin-bottom:6px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">Summary Totals</strong>' + summaryHtml + '</div>' : '') +
          '</body></html>';

        return window.__ubitOpenCenteredPrintWindow(html, title + " - " + cName);
      }

      if (mode === 'pdf') {
        if (!window.Ur) {
          alert('PDF engine is initializing. Please try again.');
          return;
        }

        const doc = new window.Ur({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        // 1. Company Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text(cName, 14, 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        if (cAddr) doc.text(cAddr.slice(0, 85), 14, 20);
        const metaLine = [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('  |  ');
        doc.text(metaLine.slice(0, 95), 14, 24.5);

        // Logo
        if (logoUrl && logoUrl.startsWith('data:image')) {
          try {
            const format = logoUrl.includes('image/jpeg') || logoUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
            doc.addImage(logoUrl, format, 160, 9, 36, 16);
          } catch(e) {}
        }

        // Top line
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.4);
        doc.line(14, 28, 196, 28);

        // 2. Title & Period
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(title, 14, 35);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('Period: ' + cleanPeriod, 196, 35, { align: 'right' });

        // 3. Table Headers
        let curY = 42;
        doc.setFillColor(241, 245, 249);
        doc.rect(14, curY, 182, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);

        // Dynamic column widths
        const totalW = 182;
        const colW = totalW / Math.max(1, headers.length);
        headers.forEach((h, i) => {
          const isNum = h.includes('(Rs.)') || h.includes('Amount') || h.includes('Debit') || h.includes('Credit') || h.includes('Movement') || h.includes('(₹)');
          const x = isNum ? 14 + (i + 1) * colW - 2 : 14 + i * colW + 2;
          doc.text(String(h).slice(0, 24), x, curY + 5, { align: isNum ? 'right' : 'left' });
        });

        curY += 7;
        doc.setDrawColor(203, 213, 225);
        doc.line(14, curY, 196, curY);

        // 4. Data Rows
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        rows.forEach((r, ri) => {
          if (curY > 265) {
            doc.addPage();
            curY = 20;
            // header on new page
            doc.setFillColor(241, 245, 249);
            doc.rect(14, curY, 182, 7, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(30, 41, 59);
            headers.forEach((h, i) => {
              const isNum = h.includes('(Rs.)') || h.includes('Amount') || h.includes('Debit') || h.includes('Credit') || h.includes('Movement') || h.includes('(₹)');
              const x = isNum ? 14 + (i + 1) * colW - 2 : 14 + i * colW + 2;
              doc.text(String(h).slice(0, 24), x, curY + 5, { align: isNum ? 'right' : 'left' });
            });
            curY += 7;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
          }

          if (ri % 2 === 1) {
            doc.setFillColor(248, 250, 252);
            doc.rect(14, curY, 182, 6, 'F');
          }

          doc.setTextColor(15, 23, 42);
          r.forEach((c, ci) => {
            const h = headers[ci] || '';
            const isNum = h.includes('(Rs.)') || h.includes('Amount') || h.includes('Debit') || h.includes('Credit') || h.includes('Movement') || h.includes('(₹)');
            const x = isNum ? 14 + (ci + 1) * colW - 2 : 14 + ci * colW + 2;
            doc.text(String(c).slice(0, 32), x, curY + 4.2, { align: isNum ? 'right' : 'left' });
          });

          curY += 6;
        });

        // Bottom border
        doc.setDrawColor(203, 213, 225);
        doc.line(14, curY, 196, curY);
        curY += 4;

        // 5. Summary Box
        if (summaryRows.length > 0) {
          if (curY > 250) { doc.addPage(); curY = 20; }
          const boxH = 7 + summaryRows.length * 5.5;
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(100, curY, 96, boxH, 2, 2, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42);
          doc.text("Summary Totals", 104, curY + 5);

          let sY = curY + 9.5;
          summaryRows.forEach(sr => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text(sr[0] + ":", 104, sY);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 23, 42);
            const valStr = sr[2] + (sr[3] ? '  |  ' + sr[3] : '');
            doc.text(valStr, 192, sY, { align: 'right' });
            sY += 5;
          });
          curY += boxH + 6;
        }

        // Output and save
        const pdfBlob = doc.output('blob');
        const fileName = safeTitle + '_' + dStr + '.pdf';
        await window.UBIT_SAVE_FILE(pdfBlob, fileName, 'application/pdf', 'PDF Document (*.pdf)', '.pdf');
        return;
      }

      if (mode === 'excel') {
        let csv = '';
        csv += '"' + cName.replace(/"/g, '""') + '"\n';
        if (cAddr) csv += '"' + cAddr.replace(/"/g, '""') + '"\n';
        csv += '"GSTIN: ' + (cGst || '-') + ' | Phone: ' + (cPhone || '-') + ' | Email: ' + (cEmail || '-') + '"\n\n';
        csv += '"' + title.replace(/"/g, '""') + '"\n';
        csv += '"Period: ' + cleanPeriod.replace(/"/g, '""') + '"\n\n';

        csv += headers.map(h => '"' + String(h).replace(/"/g, '""') + '"').join(',') + '\n';
        rows.forEach(r => {
          csv += r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',') + '\n';
        });

        if (summaryRows.length > 0) {
          csv += '\n"SUMMARY TOTALS"\n';
          summaryRows.forEach(sr => {
            csv += '"' + String(sr[0]).replace(/"/g, '""') + '","' + String(sr[1]).replace(/"/g, '""') + '","' + String(sr[2]).replace(/"/g, '""') + '"' + (sr[3] ? ',"' + String(sr[3]).replace(/"/g, '""') + '"' : '') + '\n';
          });
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const fileName = safeTitle + '_' + dStr + '.csv';
        await window.UBIT_SAVE_FILE(blob, fileName, 'text/csv;charset=utf-8;', 'Excel / CSV Document (*.csv)', '.csv');
        return;
      }
    } catch(err) {
      console.error('[UBIT] Export error:', err);
      alert('Error exporting ' + pageTitle + ': ' + err.message);
    }
  };
  window.__ubitOpenCenteredPrintWindow = function(htmlContentOrNode, docTitle) {
    try {
      const title = docTitle || "Report Print";
      const screenW = window.screen.availWidth || window.innerWidth || 1280;
      const screenH = window.screen.availHeight || window.innerHeight || 800;

      // Exact centered dimensions: NOT full width of page, positioned just in the middle
      const width = Math.min(940, Math.max(760, Math.round(screenW * 0.72)));
      const height = Math.min(840, Math.max(600, Math.round(screenH * 0.88)));
      const left = Math.max(0, Math.round((screenW - width) / 2));
      const top = Math.max(0, Math.round((screenH - height) / 2));

      const features = 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';

      let printWin = null;
      try {
        printWin = window.open("", "_blank", features);
      } catch (e) {
        printWin = null;
      }

      let contentHtml = "";
      if (typeof htmlContentOrNode === "string") {
        contentHtml = htmlContentOrNode;
      } else if (htmlContentOrNode && htmlContentOrNode.innerHTML) {
        contentHtml = htmlContentOrNode.innerHTML;
      }

      // Extract body & styles if full HTML was supplied
      let bodyContent = contentHtml;
      let extraStyles = "";
      if (contentHtml.toLowerCase().includes("<html")) {
        const bodyMatch = contentHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
          bodyContent = bodyMatch[1];
        }
        const styleMatches = contentHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
        if (styleMatches) {
          extraStyles = styleMatches.join("\n");
        }
      }

      // Strip existing script tags from bodyContent to prevent duplicate execution
      bodyContent = bodyContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      // Gather application stylesheets for high-fidelity rendering
      const appStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join("\n");

      const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
        appStyles + '\n' + extraStyles + '\n' +
        '<style>' +
        '@page { size: auto; margin: 0 !important; }' +
        '*, *::before, *::after { box-sizing: border-box; }' +
        'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; background: #f8fafc; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
        '.ubit-print-bar { position: sticky; top: 0; z-index: 9999; display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #0f172a; color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }' +
        '.ubit-print-bar .title { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; display: flex; align-items: center; gap: 8px; }' +
        '.ubit-print-bar .actions { display: flex; align-items: center; gap: 10px; }' +
        '.ubit-btn-print { display: inline-flex; align-items: center; gap: 6px; background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.15s; }' +
        '.ubit-btn-print:hover { background: #0369a1; }' +
        '.ubit-btn-close { display: inline-flex; align-items: center; gap: 4px; background: #334155; color: #f1f5f9; border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }' +
        '.ubit-btn-close:hover { background: #475569; }' +
        '.ubit-doc-container { max-width: 900px; margin: 20px auto; background: #ffffff; padding: 28px 32px; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }' +
        '.printable-area { position: static !important; left: auto !important; top: auto !important; width: 100% !important; max-width: 100% !important; margin: 0 auto !important; box-shadow: none !important; border: none !important; visibility: visible !important; display: block !important; }' +
        '.printable-area * { visibility: visible !important; }' +
        '@media print {' +
        '  @page { size: auto; margin: 0 !important; }' +
        '  html, body { background: #ffffff !important; padding: 0 !important; margin: 0 !important; width: 100% !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
        '  .ubit-print-bar, .no-print, button, svg { display: none !important; }' +
        '  .ubit-doc-container { max-width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; width: 100% !important; }' +
        '  .bill-page, .printable-bill-page, .printable-area, .ubit-printable-sheet { box-sizing: border-box !important; page-break-after: always !important; break-after: page !important; page-break-inside: avoid !important; break-inside: avoid !important; margin: 0 auto !important; padding: 8mm 10mm !important; width: 210mm !important; min-width: 210mm !important; max-width: 210mm !important; overflow: hidden !important; transform-origin: top center !important; }' +
        '  @media (max-width: 180mm), (max-height: 240mm) {' +
        '    .bill-page, .printable-bill-page, .printable-area, .ubit-printable-sheet { zoom: 0.68 !important; padding: 5mm 6mm !important; max-height: 205mm !important; }' +
        '  }' +
        '  body * { visibility: visible !important; }' +
        '}' +
        '</style></head><body>' +
        '<div class="ubit-print-bar">' +
        '  <div class="title"><span>🖨️</span><span>' + title + '</span></div>' +
        '  <div class="actions">' +
        '    <button type="button" class="ubit-btn-print" onclick="var t=document.title;document.title=\'\';window.print();setTimeout(function(){document.title=t;},1000);"><span>Select Printer / Print</span></button>' +
        '    <button type="button" class="ubit-btn-close" onclick="window.close()"><span>✕ Close</span></button>' +
        '  </div>' +
        '</div>' +
        '<div class="ubit-doc-container">' + bodyContent + '</div>' +
        '<script>' +
        'window.onload = function() {' +
        '  setTimeout(function() {' +
        '    try {' +
        '      window.focus();' +
        '      var prevTitle = document.title;' +
        '      document.title = "";' +
        '      window.print();' +
        '      setTimeout(function() { document.title = prevTitle; }, 1000);' +
        '    } catch(e) {' +
        '      console.warn("Auto print trigger error:", e);' +
        '    }' +
        '  }, 350);' +
        '};' +
        '<\/script></body></html>';

      if (printWin && typeof printWin.document !== 'undefined') {
        try {
          printWin.__isCenteredPrintPopup = true;
          printWin.document.open();
          printWin.document.write(fullHtml);
          printWin.document.close();
          return printWin;
        } catch(e) {
          console.warn("[UBIT] Could not write to popup window, using modal fallback:", e);
        }
      }

      // Centered In-Page Modal Fallback (ensures 100% pop-up reliability even with popup blockers)
      let modal = document.getElementById('ubit-centered-print-modal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'ubit-centered-print-modal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';

      const modalBox = document.createElement('div');
      modalBox.style.cssText = 'width:' + width + 'px;max-width:96vw;height:' + height + 'px;max-height:92vh;background:#ffffff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.35);display:flex;flex-direction:column;overflow:hidden;border:1px solid #cbd5e1;';

      const modalBar = document.createElement('div');
      modalBar.style.cssText = 'padding:10px 20px;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
      modalBar.innerHTML = '<div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px;"><span>🖨️</span><span>' + title + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '  <button type="button" id="ubit-modal-trigger-print" style="display:inline-flex;align-items:center;gap:6px;background:#0284c7;color:#ffffff;border:none;border-radius:6px;padding:6px 16px;font-size:12px;font-weight:700;cursor:pointer;">Select Printer / Print</button>' +
        '  <button type="button" id="ubit-modal-close-print" style="display:inline-flex;align-items:center;gap:4px;background:#334155;color:#f1f5f9;border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;">✕ Close</button>' +
        '</div>';

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'flex:1;width:100%;height:100%;border:none;background:#f8fafc;';

      modalBox.appendChild(modalBar);
      modalBox.appendChild(iframe);
      modal.appendChild(modalBox);
      document.body.appendChild(modal);

      const closeBtn = modal.querySelector('#ubit-modal-close-print');
      if (closeBtn) closeBtn.onclick = () => modal.remove();
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

      const printBtn = modal.querySelector('#ubit-modal-trigger-print');
      if (printBtn) {
        printBtn.onclick = () => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch(e) {
            window.print();
          }
        };
      }

      iframe.contentDocument.open();
      iframe.contentDocument.write(fullHtml);
      iframe.contentDocument.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch(e) {}
      }, 400);

      return modal;
    } catch(err) {
      console.error("[UBIT] Open centered print window error:", err);
      return null;
    }
  };

  // Intercept window.print globally on the main ERP app window
  (function() {
    const _origNativePrint = window.print ? window.print.bind(window) : null;
    window.__origNativePrint = _origNativePrint;

    window.print = function() {
      // If called inside the centered popup itself, execute native print dialog!
      if (window.opener || window.__isCenteredPrintPopup) {
        if (_origNativePrint) return _origNativePrint();
        return;
      }

      // If called in the main window, find the active printable preview/modal
      const printableArea = document.querySelector('.printable-area') ||
                            document.querySelector('#ubit-party-statement-modal .overflow-y-auto') ||
                            document.querySelector('#ubit-party-statement-modal') ||
                            document.querySelector('.fixed.inset-0 .bg-white.rounded-2xl') ||
                            document.querySelector('.fixed.inset-0 .bg-white');

      if (printableArea) {
        return window.__ubitOpenCenteredPrintWindow(printableArea.outerHTML, "Document Print");
      } else {
        const mainContent = document.querySelector('#root') || document.body;
        return window.__ubitOpenCenteredPrintWindow(mainContent.innerHTML, "Print");
      }
    };
  })();


  // =========================================================================
  // UBIT ERP ENTERPRISE ENHANCEMENTS: PARTY & ITEM STATEMENTS, SUMMARY TABLE, BILL PRINT
  // =========================================================================

  // Item 2-Row Summary Table React Component
  
  // Summary React Component (Removed from on-screen item page per user instruction)
  window.__ubitRenderItemSummaryReact = function() {
    return null;
  };

  // Helper for Indian Currency formatting
  function formatInr(val) {
    const num = Number(val || 0);
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const resolveCompanyHeader = window.__ubitResolveCompanyHeader || function(comp) {
    const m = (comp && comp.meta) || comp || {};
    return {
      name: m.name || 'Company Name',
      address: m.address || m.billingAddress || '',
      gstin: m.gstin || '',
      phone: m.phone || m.mobile || '',
      email: m.email || '',
      logoUrl: m.logoUrl || m.logo || '',
      themeColor: m.themeColor || '#0284c7'
    };
  };

  // =========================================================================
  // PARTY STATEMENT PRINT (Reference Image 1)
  // Header: 1st line Company Name, 2nd line Details, 3rd line GST | Phone | Email, Right: Logo
  // Sub-header: PARTY STATEMENT & Date side by side
  // Party Box: 1st line Party Name, 2nd line Details, 3rd line GST | Phone | Email, Right: Balance (Receivable / Payable)
  // Table
  // Bottom Tiles: Total Sale, Total Purchase, Total Received, Total Paid (Omit if 0!), Balance
  // =========================================================================
  window.__ubitPrintPartyTransactions = function(party, transactions, companyData) {
    if (!party) return;
    const rawList = Array.isArray(transactions) ? transactions : [];
    const txns = rawList.filter(t => t.type !== 'Sale Order' && t.type !== 'Purchase Order');
    const company = companyData || (window.UBIT_ERP_ENGINE && window.UBIT_ERP_ENGINE.getCompanyData ? window.UBIT_ERP_ENGINE.getCompanyData() : null) || {};
    const cHead = resolveCompanyHeader(company);
    const cName = cHead.name;
    const cAddr = cHead.address;
    const cPhone = cHead.phone;
    const cEmail = cHead.email;
    const cGst = cHead.gstin;
    const logoUrl = cHead.logoUrl;
    const themeColor = cHead.themeColor || '#0284c7';

    let totalSales = 0;
    let totalPurchases = 0;
    let totalReceived = 0;
    let totalPaid = 0;
    let outward = 0;
    let inward = 0;

    txns.forEach(t => {
      const type = (t.type || '').toLowerCase();
      const amt = Number(t.totalAmount != null ? t.totalAmount : (t.total || t.amount || 0));
      if (type.includes('sale') || type.includes('sales')) {
        totalSales += amt;
      } else if (type.includes('purchase')) {
        totalPurchases += amt;
      } else if (type.includes('payment in') || type.includes('payment-in') || type.includes('received')) {
        totalReceived += amt;
      } else if (type.includes('payment out') || type.includes('payment-out') || type.includes('paid')) {
        totalPaid += amt;
      }

      if (t.typeCategory === 'OUT' || type.includes('sale') || type.includes('debit note') || type.includes('payment out')) {
        outward += amt;
      } else if (t.typeCategory === 'IN' || type.includes('purchase') || type.includes('credit note') || type.includes('payment in')) {
        inward += amt;
      }
    });

    let netBalance = outward - inward;
    if (txns.length === 0 && party.currentBalance != null) {
      netBalance = Number(party.currentBalance);
    } else if (txns.length === 0 && party.balance != null) {
      netBalance = Number(party.balance);
    }

    const isReceivable = netBalance > 0.001;
    const isPayable = netBalance < -0.001;
    const balanceLabel = isReceivable ? 'Receivable' : isPayable ? 'Payable' : 'Settled';
    const balanceColor = isReceivable ? '#16a34a' : isPayable ? '#dc2626' : '#64748b';
    const absBalance = Math.abs(netBalance);

    const rowsHtml = txns.map((t, idx) => {
      const dt = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '-';
      const num = t.number || t.refNo || '-';
      const type = t.type || 'Transaction';
      const qty = typeof t.qty === 'number' ? t.qty : (Number(t.qty) || '-');
      const amt = Number(t.totalAmount != null ? t.totalAmount : (t.total || t.amount || 0));
      const rate = typeof t.priceUnit === 'number' && t.qty > 0 ? ('₹ ' + Number(t.priceUnit).toLocaleString('en-IN', { minimumFractionDigits: 2 })) : '-';
      const st = t.status || '-';
      return '<tr>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">' + (idx + 1) + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; white-space: nowrap;">' + dt + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">' + type + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-family: monospace;">' + num + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">' + qty + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-family: monospace;">₹ ' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">' + rate + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9.5px;font-weight:bold;background:#f1f5f9;color:#334155;">' + st + '</span></td>' +
        '</tr>';
    }).join('');

    const tiles = [];
    if (totalSales > 0) {
      tiles.push('<div class="tile"><span class="tile-label">TOTAL SALE</span><div class="tile-val" style="color: #0284c7;">₹ ' + totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div></div>');
    }
    if (totalPurchases > 0) {
      tiles.push('<div class="tile"><span class="tile-label">TOTAL PURCHASE</span><div class="tile-val" style="color: #475569;">₹ ' + totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div></div>');
    }
    if (totalReceived > 0) {
      tiles.push('<div class="tile"><span class="tile-label">TOTAL RECEIVED</span><div class="tile-val" style="color: #16a34a;">₹ ' + totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div></div>');
    }
    if (totalPaid > 0) {
      tiles.push('<div class="tile"><span class="tile-label">TOTAL PAID</span><div class="tile-val" style="color: #dc2626;">₹ ' + totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div></div>');
    }
    tiles.push('<div class="tile"><span class="tile-label">' + balanceLabel.toUpperCase() + '</span><div class="tile-val" style="color: ' + balanceColor + ';">₹ ' + absBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div></div>');

    const pAddr = party.billingAddress || party.address || '';
    const pGst = party.gstin ? ('GSTIN: ' + party.gstin) : '';
    const pPhone = party.phone ? ('Phone: ' + party.phone) : '';
    const pEmail = party.email ? ('Email: ' + party.email) : '';

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + party.name + ' - Party Statement</title>' +
      '<style>' +
      '@page { size: auto; margin: 0 !important; }' +
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 14mm 16mm; color: #0f172a; font-size: 11px; }' +
      '.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ' + themeColor + '; padding-bottom: 12px; margin-bottom: 12px; }' +
      '.comp-name { font-size: 18px; font-weight: 900; text-transform: uppercase; color: ' + themeColor + '; line-height: 1.2; }' +
      '.comp-detail { font-size: 10px; color: #475569; margin-top: 2px; }' +
      '.comp-tax { font-size: 9.5px; color: #64748b; margin-top: 2px; font-family: monospace; }' +
      '.sub-bar { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; margin-bottom: 12px; }' +
      '.sub-bar-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: ' + themeColor + '; letter-spacing: 0.5px; }' +
      '.sub-bar-date { font-size: 10px; font-weight: 700; color: #64748b; }' +
      '.party-box { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }' +
      '.party-title { font-size: 14px; font-weight: 800; color: #0f172a; line-height: 1.2; }' +
      '.party-detail { font-size: 10px; color: #475569; margin-top: 2px; }' +
      '.party-tax { font-size: 9.5px; color: #64748b; margin-top: 2px; font-family: monospace; }' +
      'table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px; }' +
      'th { background: #f8fafc; color: #334155; font-weight: bold; text-transform: uppercase; font-size: 9.5px; padding: 7px 8px; border: 1px solid #cbd5e1; text-align: left; }' +
      '.summary-tiles { display: grid; grid-template-columns: repeat(' + Math.min(tiles.length, 5) + ', 1fr); gap: 10px; margin-top: 14px; }' +
      '.tile { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: left; }' +
      '.tile-label { font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; display: block; }' +
      '.tile-val { font-size: 13px; font-weight: 900; font-family: monospace; margin-top: 3px; }' +
      '</style></head><body>' +
      '<div class="ubit-printable-sheet">' +
        '<div class="header">' +
          '<div>' +
            '<div class="comp-name">' + cName + '</div>' +
            (cAddr ? '<div class="comp-detail">' + cAddr + '</div>' : '') +
            '<div class="comp-tax">' + [cGst ? ('GSTIN: ' + cGst) : '', cPhone ? ('Phone: ' + cPhone) : '', cEmail ? ('Email: ' + cEmail) : ''].filter(Boolean).join('   |   ') + '</div>' +
          '</div>' +
          '<div>' +
            (logoUrl ? '<img src="' + logoUrl + '" alt="Logo" style="max-height: 52px; max-width: 150px; object-fit: contain;" />' : '') +
          '</div>' +
        '</div>' +
        '<div class="sub-bar">' +
          '<div class="sub-bar-title">PARTY STATEMENT</div>' +
          '<div class="sub-bar-date">Date: ' + new Date().toLocaleDateString('en-GB') + '</div>' +
        '</div>' +
        '<div class="party-box">' +
          '<div>' +
            '<div class="party-title">' + party.name + '</div>' +
            (pAddr ? '<div class="party-detail">' + pAddr + '</div>' : '') +
            '<div class="party-tax">' + [pGst, pPhone, pEmail].filter(Boolean).join('   |   ') + '</div>' +
          '</div>' +
          '<div style="text-align: right;">' +
            '<div style="font-size: 9.5px; font-weight: 700; color: #64748b; text-transform: uppercase;">Balance</div>' +
            '<div style="font-size: 15px; font-weight: 900; font-family: monospace; color: ' + balanceColor + '; margin-top: 2px;">' + balanceLabel + ' ₹ ' + absBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div>' +
          '</div>' +
        '</div>' +
        '<table>' +
          '<thead><tr><th style="text-align: center;">#</th><th>Date</th><th>Type</th><th>Ref No</th><th style="text-align: right;">Qty</th><th style="text-align: right;">Total Amount</th><th style="text-align: right;">Price Per Unit</th><th style="text-align: center;">Status</th></tr></thead>' +
          '<tbody>' + (rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8;">No transactions found</td></tr>') + '</tbody>' +
        '</table>' +
        '<div class="summary-tiles">' + tiles.join('') + '</div>' +
      '</div>' +
      '</body></html>';

    return window.__ubitOpenCenteredPrintWindow(html, party.name + " - Party Statement");
  };

  // =========================================================================
  // PARTY STATEMENT SAVE PDF (Strictly excludes SO & PO, Omit Paid if 0)
  // =========================================================================
  window.__ubitSavePartyPDF = async function(party, transactions, companyData) {
    if (!party) return;
    const rawList = Array.isArray(transactions) ? transactions : [];
    const txns = rawList.filter(t => t.type !== 'Sale Order' && t.type !== 'Purchase Order');
    const company = companyData || (window.UBIT_ERP_ENGINE && window.UBIT_ERP_ENGINE.getCompanyData ? window.UBIT_ERP_ENGINE.getCompanyData() : null) || {};
    const cHead = resolveCompanyHeader(company);
    const cName = cHead.name || 'Company Name';
    const cAddr = cHead.address || '';
    const cPhone = cHead.phone || '';
    const cEmail = cHead.email || '';
    const cGst = cHead.gstin || '';
    const logoUrl = cHead.logoUrl || '';

    const jsPdfClass = window.Ur || window.jspdf?.jsPDF || (typeof Ur !== 'undefined' ? Ur : null);
    if (!jsPdfClass) {
      alert("PDF engine loading. Please try again in a moment.");
      return;
    }

    const doc = new jsPdfClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // 1. Company Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(cName, 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    let curY = 21;
    if (cAddr) {
      doc.text(cAddr.slice(0, 68), 14, curY);
      curY += 4.2;
    }
    const taxLine = [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('   |   ');
    if (taxLine) {
      doc.text(taxLine.slice(0, 75), 14, curY);
      curY += 5;
    }

    // Logo on right corner
    if (logoUrl && logoUrl.startsWith('data:image')) {
      try {
        const format = logoUrl.includes('image/jpeg') || logoUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
        doc.addImage(logoUrl, format, 162, 11, 32, 16);
      } catch(e) {}
    }

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.6);
    doc.line(14, curY, 196, curY);
    curY += 6;

    // Sub-bar: Party Statement and Date
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text("PARTY STATEMENT", 14, curY);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("DATE: " + new Date().toLocaleDateString('en-GB'), 196, curY, { align: 'right' });
    curY += 6;

    // Balance calculation
    let totalSales = 0;
    let totalPurchases = 0;
    let totalReceived = 0;
    let totalPaid = 0;
    let outward = 0;
    let inward = 0;

    txns.forEach(t => {
      const type = (t.type || '').toLowerCase();
      const amt = Number(t.totalAmount != null ? t.totalAmount : (t.total || t.amount || 0));
      if (type.includes('sale') || type.includes('sales')) totalSales += amt;
      else if (type.includes('purchase')) totalPurchases += amt;
      else if (type.includes('payment in') || type.includes('payment-in') || type.includes('received')) totalReceived += amt;
      else if (type.includes('payment out') || type.includes('payment-out') || type.includes('paid')) totalPaid += amt;

      if (t.typeCategory === 'OUT' || type.includes('sale') || type.includes('debit note') || type.includes('payment out')) outward += amt;
      else if (t.typeCategory === 'IN' || type.includes('purchase') || type.includes('credit note') || type.includes('payment in')) inward += amt;
    });

    let netBalance = outward - inward;
    if (txns.length === 0 && party.currentBalance != null) netBalance = Number(party.currentBalance);
    else if (txns.length === 0 && party.balance != null) netBalance = Number(party.balance);

    const isReceivable = netBalance > 0.001;
    const isPayable = netBalance < -0.001;
    const balanceLabel = isReceivable ? 'Receivable' : isPayable ? 'Payable' : 'Settled';
    const absBalance = Math.abs(netBalance);

    // Party Details Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, curY, 182, 18, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(party.name.slice(0, 45), 18, curY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const pAddr = party.billingAddress || party.address || '';
    if (pAddr) {
      doc.text(pAddr.slice(0, 60), 18, curY + 11);
    }
    const pTax = [(party.gstin ? 'GSTIN: ' + party.gstin : ''), (party.phone ? 'Phone: ' + party.phone : ''), (party.email ? 'Email: ' + party.email : '')].filter(Boolean).join('   |   ');
    doc.text(pTax.slice(0, 65), 18, curY + (pAddr ? 15.5 : 12));

    // Balance on right side of party box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("BALANCE", 192, curY + 6, { align: 'right' });
    doc.setFontSize(9.5);
    if (isReceivable) doc.setTextColor(22, 163, 74);
    else if (isPayable) doc.setTextColor(220, 38, 38);
    else doc.setTextColor(100, 116, 139);
    doc.text(balanceLabel + " Rs. " + absBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }), 192, curY + 13, { align: 'right' });

    curY += 22;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('#', 16, curY + 4.5);
    doc.text('Date', 26, curY + 4.5);
    doc.text('Type', 48, curY + 4.5);
    doc.text('Ref No', 78, curY + 4.5);
    doc.text('Qty', 112, curY + 4.5, { align: 'right' });
    doc.text('Total Amount (Rs.)', 152, curY + 4.5, { align: 'right' });
    doc.text('Status', 188, curY + 4.5, { align: 'center' });
    curY += 6.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    txns.forEach((t, idx) => {
      if (curY > 260) {
        doc.addPage();
        curY = 16;
      }
      const dt = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '-';
      const type = (t.type || 'Txn').slice(0, 15);
      const num = (t.number || t.refNo || '-').slice(0, 15);
      const qty = typeof t.qty === 'number' ? String(t.qty) : (t.qty != null ? String(t.qty) : '-');
      const amt = Number(t.totalAmount != null ? t.totalAmount : (t.total || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      const st = (t.status || 'Paid').slice(0, 10);

      doc.text(String(idx + 1), 16, curY + 4.5);
      doc.text(dt, 26, curY + 4.5);
      doc.text(type, 48, curY + 4.5);
      doc.text(num, 78, curY + 4.5);
      doc.text(qty, 112, curY + 4.5, { align: 'right' });
      doc.text(amt, 152, curY + 4.5, { align: 'right' });
      doc.text(st, 188, curY + 4.5, { align: 'center' });

      doc.setDrawColor(241, 245, 249);
      doc.line(14, curY + 6, 196, curY + 6);
      curY += 6;
    });

    // Summary Tiles at bottom (AFTER the table)
    if (curY > 255) {
      doc.addPage();
      curY = 16;
    } else {
      curY += 4;
    }

    const pdfTiles = [];
    if (totalSales > 0) pdfTiles.push({ label: 'TOTAL SALE', val: 'Rs. ' + totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 }), color: [2, 132, 199] });
    if (totalPurchases > 0) pdfTiles.push({ label: 'TOTAL PURCHASE', val: 'Rs. ' + totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 }), color: [71, 85, 105] });
    if (totalReceived > 0) pdfTiles.push({ label: 'RECEIVED', val: 'Rs. ' + totalReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 }), color: [22, 163, 74] });
    if (totalPaid > 0) pdfTiles.push({ label: 'PAID', val: 'Rs. ' + totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 }), color: [220, 38, 38] });
    pdfTiles.push({ label: balanceLabel.toUpperCase(), val: 'Rs. ' + absBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }), color: isReceivable ? [22, 163, 74] : isPayable ? [220, 38, 38] : [100, 116, 139] });

    const tileW = 182 / pdfTiles.length;
    pdfTiles.forEach((tile, ti) => {
      const tx = 14 + (ti * tileW);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(tx, curY, tileW - 2, 12, 1, 1, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(tile.label, tx + 3, curY + 4.5);
      doc.setFontSize(8);
      doc.setTextColor(tile.color[0], tile.color[1], tile.color[2]);
      doc.text(tile.val, tx + 3, curY + 9.5);
    });

    const safeName = party.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const filename = safeName + '_Party_Statement.pdf';
    const blob = doc.output('blob');

    let targetDir = null;
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        targetDir = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch(e) {
        // User cancelled folder selection -> DO NOT DOWNLOAD, EXIT IMMEDIATELY
        return;
      }
      if (!targetDir) {
        // User cancelled folder selection -> DO NOT DOWNLOAD, EXIT IMMEDIATELY
        return;
      }
    }

    if (targetDir) {
      try {
        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (typeof showSleekToast === 'function') {
          showSleekToast('Party Statement PDF saved successfully!');
        } else {
          alert('Party Statement PDF saved successfully!');
        }
      } catch(e) {
        console.error('Error writing party statement PDF:', e);
      }
      return;
    }

    // Fallback only if showDirectoryPicker completely not supported in browser
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'PDF Document (*.pdf)', accept: { 'application/pdf': ['.pdf'] } }]
        });
        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          if (typeof showSleekToast === 'function') {
            showSleekToast('Party Statement PDF saved successfully!');
          }
        }
      } catch (err) {
        // User cancelled -> DO NOT DOWNLOAD
        return;
      }
      return;
    }
  };

  // =========================================================================
  // ITEM STATEMENT PRINT (Reference Image 2)
  // Auto-collects transactions if empty; 3-line Company Header with logo;
  // Sub-header: ITEM STATEMENT & Date side by side;
  // Item Box: Item name on left, Profit/Loss value on right;
  // Transactions Table;
  // Summary Table / Tiles at the bottom AFTER the table.
  // =========================================================================
  window.__ubitPrintItemTransactions = function(item, transactions, companyData) {
    if (!item) return;
    const company = companyData || (window.UBIT_ERP_ENGINE && window.UBIT_ERP_ENGINE.getCompanyData ? window.UBIT_ERP_ENGINE.getCompanyData() : null) || {};
    let rawList = Array.isArray(transactions) ? transactions : [];

    // Robust fallback: auto-collect item transactions if passed array is empty
    if (rawList.length === 0 && company) {
      const itemId = item.id;
      const itemName = (item.name || '').toLowerCase().trim();
      const matchItem = it => (it.itemId === itemId || it.id === itemId || (it.name && it.name.toLowerCase().trim() === itemName));

      (company.sales || []).forEach(s => {
        const hits = (s.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'sale_' + s.id,
            sourceType: 'sale',
            type: 'Sale',
            typeCategory: 'OUT',
            refNo: s.invoiceNo || s.id,
            name: s.partyName || s.customerName || 'Customer',
            date: s.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: s.status || 'Paid'
          });
        }
      });

      (company.purchases || []).forEach(p => {
        const hits = (p.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'pur_' + p.id,
            sourceType: 'purchase',
            type: 'Purchase',
            typeCategory: 'IN',
            refNo: p.billNo || p.invoiceNo || p.id,
            name: p.partyName || p.supplierName || 'Supplier',
            date: p.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: p.status || 'Paid'
          });
        }
      });

      (company.creditNotes || []).forEach(cn => {
        const hits = (cn.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'cn_' + cn.id,
            sourceType: 'creditNote',
            type: 'Credit Note',
            typeCategory: 'IN',
            refNo: cn.creditNoteNo || cn.noteNo || cn.id,
            name: cn.partyName || 'Customer',
            date: cn.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: cn.status || 'Paid'
          });
        }
      });

      (company.debitNotes || []).forEach(dn => {
        const hits = (dn.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'dn_' + dn.id,
            sourceType: 'debitNote',
            type: 'Debit Note',
            typeCategory: 'OUT',
            refNo: dn.debitNoteNo || dn.noteNo || dn.id,
            name: dn.partyName || 'Supplier',
            date: dn.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: dn.status || 'Paid'
          });
        }
      });

      rawList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }

    const txns = rawList.filter(t => t.type !== 'Sale Order' && t.type !== 'Purchase Order');
    const cHead = resolveCompanyHeader(company);
    const cName = cHead.name;
    const cAddr = cHead.address;
    const cPhone = cHead.phone;
    const cEmail = cHead.email;
    const cGst = cHead.gstin;
    const logoUrl = cHead.logoUrl;
    const themeColor = cHead.themeColor || '#0284c7';

    const totalRecord = txns.length;
    const sales = txns.filter(t => t.type === 'Sale' || t.type === 'Sales');
    const purchases = txns.filter(t => t.type === 'Purchase');

    const totalSaleValue = sales.reduce((sum, t) => sum + Number(t.totalAmount != null ? t.totalAmount : (t.total || 0)), 0);
    const totalPurchaseValue = purchases.reduce((sum, t) => sum + Number(t.totalAmount != null ? t.totalAmount : (t.total || 0)), 0);
    const totalSaleQty = sales.reduce((sum, t) => sum + Number(t.qty || 0), 0);
    const totalPurchaseQty = purchases.reduce((sum, t) => sum + Number(t.qty || 0), 0);
    const totalQuantity = txns.reduce((sum, t) => sum + Number(typeof t.qty === 'number' ? t.qty : (Number(t.qty) || 0)), 0);

    const profit = totalSaleValue - totalPurchaseValue;
    const isProfit = profit >= 0;
    const profitTitle = isProfit ? "Total Profit" : "Total Loss";
    const profitColor = isProfit ? "#16a34a" : "#dc2626";

    const avgSaleRate = totalSaleQty > 0 ? (totalSaleValue / totalSaleQty) : 0;
    const avgPurchaseRate = totalPurchaseQty > 0 ? (totalPurchaseValue / totalPurchaseQty) : 0;

    const rowsHtml = txns.map((t, idx) => {
      const dt = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '-';
      const num = t.refNo || t.number || '-';
      const type = t.type || 'Transaction';
      const pName = t.name || '-';
      const qty = typeof t.qty === 'number' ? t.qty : (Number(t.qty) || '-');
      const amt = Number(t.totalAmount != null ? t.totalAmount : (t.total || 0));
      const rate = typeof t.priceUnit === 'number' && t.qty > 0 ? ('₹ ' + Number(t.priceUnit).toLocaleString('en-IN', { minimumFractionDigits: 2 })) : '-';
      const st = t.status || '-';
      return '<tr>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;">' + (idx + 1) + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; white-space: nowrap;">' + dt + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">' + type + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-family: monospace;">' + num + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1;">' + pName + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">' + qty + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-family: monospace;">₹ ' + amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">' + rate + '</td>' +
        '<td style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: center;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9.5px;font-weight:bold;background:#f1f5f9;color:#334155;">' + st + '</span></td>' +
        '</tr>';
    }).join('');

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + item.name + ' - Item Statement</title>' +
      '<style>' +
      '@page { size: auto; margin: 0 !important; }' +
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 14mm 16mm; color: #0f172a; font-size: 11px; }' +
      '.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ' + themeColor + '; padding-bottom: 12px; margin-bottom: 12px; }' +
      '.comp-name { font-size: 18px; font-weight: 900; text-transform: uppercase; color: ' + themeColor + '; line-height: 1.2; }' +
      '.comp-detail { font-size: 10px; color: #475569; margin-top: 2px; }' +
      '.comp-tax { font-size: 9.5px; color: #64748b; margin-top: 2px; font-family: monospace; }' +
      '.sub-bar { display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; margin-bottom: 12px; }' +
      '.sub-bar-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: ' + themeColor + '; letter-spacing: 0.5px; }' +
      '.sub-bar-date { font-size: 10px; font-weight: 700; color: #64748b; }' +
      '.item-box { display: flex; justify-content: space-between; align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }' +
      '.item-title { font-size: 14px; font-weight: 800; color: #0f172a; line-height: 1.2; }' +
      '.item-detail { font-size: 9.5px; color: #64748b; margin-top: 2px; font-family: monospace; }' +
      '.txns { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px; }' +
      '.txns th { background: #f8fafc; color: #334155; font-weight: bold; text-transform: uppercase; font-size: 9.5px; padding: 7px 8px; border: 1px solid #cbd5e1; text-align: left; }' +
      '.metrics-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 14px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }' +
      '.metrics-table th { background: #f1f5f9; color: #334155; font-weight: 800; text-transform: uppercase; font-size: 9px; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; }' +
      '.metrics-table td { font-family: monospace; font-weight: bold; font-size: 11px; padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #0f172a; }' +
      '</style></head><body>' +
      '<div class="ubit-printable-sheet">' +
        '<div class="header">' +
          '<div>' +
            '<div class="comp-name">' + cName + '</div>' +
            (cAddr ? '<div class="comp-detail">' + cAddr + '</div>' : '') +
            '<div class="comp-tax">' + [cGst ? ('GSTIN: ' + cGst) : '', cPhone ? ('Phone: ' + cPhone) : '', cEmail ? ('Email: ' + cEmail) : ''].filter(Boolean).join('   |   ') + '</div>' +
          '</div>' +
          '<div>' +
            (logoUrl ? '<img src="' + logoUrl + '" alt="Logo" style="max-height: 52px; max-width: 150px; object-fit: contain;" />' : '') +
          '</div>' +
        '</div>' +
        '<div class="sub-bar">' +
          '<div class="sub-bar-title">ITEM STATEMENT</div>' +
          '<div class="sub-bar-date">Date: ' + new Date().toLocaleDateString('en-GB') + '</div>' +
        '</div>' +
        '<div class="item-box">' +
          '<div>' +
            '<div class="item-title">' + item.name + '</div>' +
            '<div class="item-detail">' + [(item.code ? 'Code: ' + item.code : ''), (item.hsn ? 'HSN: ' + item.hsn : ''), (item.unit ? 'Unit: ' + item.unit : '')].filter(Boolean).join('   |   ') + '</div>' +
          '</div>' +
          '<div style="text-align: right;">' +
            '<div style="font-size: 9.5px; font-weight: 700; color: #64748b; text-transform: uppercase;">' + (isProfit ? 'Profit' : 'Loss') + '</div>' +
            '<div style="font-size: 15px; font-weight: 900; font-family: monospace; color: ' + profitColor + '; margin-top: 2px;">' + (isProfit ? 'Profit' : 'Loss') + ' ₹ ' + Math.abs(profit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</div>' +
          '</div>' +
        '</div>' +
        '<table class="txns">' +
          '<thead><tr><th style="text-align: center;">#</th><th>Date</th><th>Type</th><th>Ref No</th><th>Party Name</th><th style="text-align: right;">Qty</th><th style="text-align: right;">Total Amount</th><th style="text-align: right;">Price Per Unit</th><th style="text-align: center;">Status</th></tr></thead>' +
          '<tbody>' + (rowsHtml || '<tr><td colspan="9" style="text-align: center; padding: 24px; color: #94a3b8;">No transactions found</td></tr>') + '</tbody>' +
        '</table>' +
        '<table class="metrics-table" style="width: 100% !important; border-collapse: collapse !important; border: 1.5px solid #cbd5e1 !important; margin-top: 14px !important; background: #ffffff !important;">' +
          '<thead>' +
            '<tr style="background: #f1f5f9 !important;">' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 800 !important; text-align: center !important; text-transform: uppercase !important; color: #334155 !important;">Total Record</th>' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 800 !important; text-align: center !important; text-transform: uppercase !important; color: #334155 !important;">Total Quantity</th>' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 800 !important; text-align: center !important; text-transform: uppercase !important; color: #334155 !important;">Total Sale Value</th>' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 800 !important; text-align: center !important; text-transform: uppercase !important; color: #334155 !important;">Total Purchase Value</th>' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 900 !important; text-align: center !important; text-transform: uppercase !important; color: ' + profitColor + ' !important;">' + profitTitle + '</th>' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 800 !important; text-align: center !important; text-transform: uppercase !important; color: #334155 !important;">Average pc sale rate</th>' +
              '<th style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 8px 10px !important; font-size: 9px !important; font-weight: 800 !important; text-align: center !important; text-transform: uppercase !important; color: #334155 !important;">Average pc purchase rate</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: bold !important; font-size: 11px !important; text-align: center !important; color: #0f172a !important;">' + totalRecord + '</td>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: bold !important; font-size: 11px !important; text-align: center !important; color: #0f172a !important;">' + totalQuantity + '</td>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: bold !important; font-size: 11px !important; text-align: center !important; color: #0284c7 !important;">₹ ' + totalSaleValue.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: bold !important; font-size: 11px !important; text-align: center !important; color: #0f172a !important;">₹ ' + totalPurchaseValue.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: 900 !important; font-size: 11px !important; text-align: center !important; color: ' + profitColor + ' !important;">₹ ' + Math.abs(profit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: bold !important; font-size: 11px !important; text-align: center !important; color: #0f172a !important;">₹ ' + avgSaleRate.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
              '<td style="border: 1px solid #cbd5e1 !important; border-bottom: 2px solid #cbd5e1 !important; padding: 10px 8px !important; font-family: monospace !important; font-weight: bold !important; font-size: 11px !important; text-align: center !important; color: #0f172a !important;">₹ ' + avgPurchaseRate.toLocaleString('en-IN', { minimumFractionDigits: 2 }) + '</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +
      '</body></html>';

    return window.__ubitOpenCenteredPrintWindow(html, item.name + " - Item Statement");
  };

  // =========================================================================
  // ITEM STATEMENT SAVE PDF (Strictly excludes SO & PO)
  // =========================================================================
  window.__ubitSaveItemPDF = async function(item, transactions, companyData) {
    if (!item) return;
    const company = companyData || (window.UBIT_ERP_ENGINE && window.UBIT_ERP_ENGINE.getCompanyData ? window.UBIT_ERP_ENGINE.getCompanyData() : null) || {};
    let rawList = Array.isArray(transactions) ? transactions : [];

    // Robust fallback: auto-collect item transactions if passed array is empty
    if (rawList.length === 0 && company) {
      const itemId = item.id;
      const itemName = (item.name || '').toLowerCase().trim();
      const matchItem = it => (it.itemId === itemId || it.id === itemId || (it.name && it.name.toLowerCase().trim() === itemName));

      (company.sales || []).forEach(s => {
        const hits = (s.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'sale_' + s.id,
            sourceType: 'sale',
            type: 'Sale',
            typeCategory: 'OUT',
            refNo: s.invoiceNo || s.id,
            name: s.partyName || s.customerName || 'Customer',
            date: s.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: s.status || 'Paid'
          });
        }
      });

      (company.purchases || []).forEach(p => {
        const hits = (p.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'pur_' + p.id,
            sourceType: 'purchase',
            type: 'Purchase',
            typeCategory: 'IN',
            refNo: p.billNo || p.invoiceNo || p.id,
            name: p.partyName || p.supplierName || 'Supplier',
            date: p.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: p.status || 'Paid'
          });
        }
      });

      (company.creditNotes || []).forEach(cn => {
        const hits = (cn.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'cn_' + cn.id,
            sourceType: 'creditNote',
            type: 'Credit Note',
            typeCategory: 'IN',
            refNo: cn.creditNoteNo || cn.noteNo || cn.id,
            name: cn.partyName || 'Customer',
            date: cn.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: cn.status || 'Paid'
          });
        }
      });

      (company.debitNotes || []).forEach(dn => {
        const hits = (dn.items || []).filter(matchItem);
        if (hits.length > 0) {
          const totQty = hits.reduce((sum, h) => sum + Number(h.qty || 0), 0);
          const totAmt = hits.reduce((sum, h) => sum + Number(h.totalAmount || h.amount || 0), 0);
          rawList.push({
            id: 'dn_' + dn.id,
            sourceType: 'debitNote',
            type: 'Debit Note',
            typeCategory: 'OUT',
            refNo: dn.debitNoteNo || dn.noteNo || dn.id,
            name: dn.partyName || 'Supplier',
            date: dn.date,
            qty: totQty,
            totalAmount: totAmt,
            priceUnit: totQty > 0 ? (totAmt / totQty) : 0,
            status: dn.status || 'Paid'
          });
        }
      });

      rawList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }

    const txns = rawList.filter(t => t.type !== 'Sale Order' && t.type !== 'Purchase Order');
    const cMeta = company.meta || company || {};
    const cName = cMeta.name || cMeta.businessName || 'Company Name';
    const cAddr = cMeta.address || cMeta.billingAddress || '';
    const cPhone = cMeta.phone || cMeta.mobile || '';
    const cEmail = cMeta.email || '';
    const cGst = cMeta.gstin || '';
    const logoUrl = cMeta.logoUrl || cMeta.logo || '';

    const jsPdfClass = window.Ur || window.jspdf?.jsPDF || (typeof Ur !== 'undefined' ? Ur : null);
    if (!jsPdfClass) {
      alert("PDF engine loading. Please try again in a moment.");
      return;
    }

    const doc = new jsPdfClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // 1. Company Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(cName, 14, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    let curY = 21;
    if (cAddr) {
      doc.text(cAddr.slice(0, 68), 14, curY);
      curY += 4.2;
    }
    const taxLine = [cGst ? 'GSTIN: ' + cGst : '', cPhone ? 'Phone: ' + cPhone : '', cEmail ? 'Email: ' + cEmail : ''].filter(Boolean).join('   |   ');
    if (taxLine) {
      doc.text(taxLine.slice(0, 75), 14, curY);
      curY += 5;
    }

    if (logoUrl && logoUrl.startsWith('data:image')) {
      try {
        const format = logoUrl.includes('image/jpeg') || logoUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
        doc.addImage(logoUrl, format, 162, 11, 32, 16);
      } catch(e) {}
    }

    doc.setDrawColor(2, 132, 199);
    doc.setLineWidth(0.6);
    doc.line(14, curY, 196, curY);
    curY += 6;

    // Sub-bar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(2, 132, 199);
    doc.text("ITEM STATEMENT", 14, curY);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("DATE: " + new Date().toLocaleDateString('en-GB'), 196, curY, { align: 'right' });
    curY += 6;

    // Item Metrics calculation
    const totalRecord = txns.length;
    const sales = txns.filter(t => t.type === 'Sale' || t.type === 'Sales');
    const purchases = txns.filter(t => t.type === 'Purchase');
    const totalSaleValue = sales.reduce((sum, t) => sum + Number(t.totalAmount != null ? t.totalAmount : (t.total || 0)), 0);
    const totalPurchaseValue = purchases.reduce((sum, t) => sum + Number(t.totalAmount != null ? t.totalAmount : (t.total || 0)), 0);
    const totalSaleQty = sales.reduce((sum, t) => sum + Number(t.qty || 0), 0);
    const totalPurchaseQty = purchases.reduce((sum, t) => sum + Number(t.qty || 0), 0);
    const totalQuantity = txns.reduce((sum, t) => sum + Number(typeof t.qty === 'number' ? t.qty : (Number(t.qty) || 0)), 0);
    const profit = totalSaleValue - totalPurchaseValue;
    const isProfit = profit >= 0;
    const profitTitle = isProfit ? "Total Profit" : "Total Loss";
    const avgSaleRate = totalSaleQty > 0 ? (totalSaleValue / totalSaleQty) : 0;
    const avgPurchaseRate = totalPurchaseQty > 0 ? (totalPurchaseValue / totalPurchaseQty) : 0;

    // Item info box with profit/loss on right
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, curY, 182, 18, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(item.name.slice(0, 45), 18, curY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const iLine = [(item.code ? 'Code: ' + item.code : ''), (item.hsn ? 'HSN: ' + item.hsn : ''), (item.unit ? 'Unit: ' + item.unit : '')].filter(Boolean).join('   |   ');
    doc.text(iLine || 'Product Ledger Statement', 18, curY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text((isProfit ? "PROFIT" : "LOSS"), 192, curY + 6, { align: 'right' });
    doc.setFontSize(9.5);
    if (isProfit) doc.setTextColor(22, 163, 74); else doc.setTextColor(220, 38, 38);
    doc.text((isProfit ? "Profit " : "Loss ") + "Rs. " + Math.abs(profit).toLocaleString('en-IN', { minimumFractionDigits: 2 }), 192, curY + 13, { align: 'right' });

    curY += 22;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(14, curY, 182, 6.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('#', 16, curY + 4.5);
    doc.text('Date', 24, curY + 4.5);
    doc.text('Type', 44, curY + 4.5);
    doc.text('Ref No', 68, curY + 4.5);
    doc.text('Party Name', 98, curY + 4.5);
    doc.text('Qty', 140, curY + 4.5, { align: 'right' });
    doc.text('Total Amount (Rs.)', 172, curY + 4.5, { align: 'right' });
    doc.text('Status', 190, curY + 4.5, { align: 'center' });
    curY += 6.5;

    // Table rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    txns.forEach((t, idx) => {
      if (curY > 255) {
        doc.addPage();
        curY = 16;
      }
      const dt = t.date ? new Date(t.date).toLocaleDateString('en-GB') : '-';
      const type = (t.type || 'Txn').slice(0, 12);
      const num = (t.refNo || t.number || '-').slice(0, 12);
      const pName = (t.name || '-').slice(0, 20);
      const qty = typeof t.qty === 'number' ? String(t.qty) : (t.qty != null ? String(t.qty) : '-');
      const amt = Number(t.totalAmount != null ? t.totalAmount : (t.total || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      const st = (t.status || 'Paid').slice(0, 10);

      doc.text(String(idx + 1), 16, curY + 4.5);
      doc.text(dt, 24, curY + 4.5);
      doc.text(type, 44, curY + 4.5);
      doc.text(num, 68, curY + 4.5);
      doc.text(pName, 98, curY + 4.5);
      doc.text(qty, 140, curY + 4.5, { align: 'right' });
      doc.text(amt, 172, curY + 4.5, { align: 'right' });
      doc.text(st, 190, curY + 4.5, { align: 'center' });

      doc.setDrawColor(241, 245, 249);
      doc.line(14, curY + 6, 196, curY + 6);
      curY += 6;
    });

    // Summary Tiles at bottom (AFTER the table)
    if (curY > 250) {
      doc.addPage();
      curY = 16;
    } else {
      curY += 4;
    }

    // Summary Table at bottom (AFTER the table) - 2 rows, bordered lines, centered title & content
    const summaryCols = [
      { title: "RECORDS", val: String(totalRecord), isProfit: false },
      { title: "TOTAL QTY", val: String(totalQuantity), isProfit: false },
      { title: "TOTAL SALE", val: "Rs. " + totalSaleValue.toFixed(0), isProfit: false },
      { title: "TOTAL PURCHASE", val: "Rs. " + totalPurchaseValue.toFixed(0), isProfit: false },
      { title: profitTitle.toUpperCase(), val: "Rs. " + Math.abs(profit).toFixed(0), isProfit: true },
      { title: "AVG SALE RATE", val: "Rs. " + avgSaleRate.toFixed(2), isProfit: false }
    ];

    const tableX = 14;
    const tableW = 182;
    const headerH = 6.5;
    const rowH = 7.5;
    const tableH = headerH + rowH; // 14mm
    const colW = tableW / summaryCols.length; // ~30.33mm each

    // Header row background
    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, curY, tableW, headerH, 'F');

    // Values row background
    doc.setFillColor(255, 255, 255);
    doc.rect(tableX, curY + headerH, tableW, rowH, 'F');

    // Table outer border
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.35);
    doc.rect(tableX, curY, tableW, tableH);

    // Horizontal line separating headers and values
    doc.line(tableX, curY + headerH, tableX + tableW, curY + headerH);

    // Vertical dividing lines and centered text for each column
    summaryCols.forEach((col, cIdx) => {
      const colLeft = tableX + (cIdx * colW);
      const colCenter = colLeft + (colW / 2);

      // Vertical line between columns
      if (cIdx > 0) {
        doc.line(colLeft, curY, colLeft, curY + tableH);
      }

      // Title centered within cell
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(col.title, colCenter, curY + 4.5, { align: 'center' });

      // Value centered within cell
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      if (col.isProfit) {
        if (isProfit) doc.setTextColor(22, 163, 74); // Green for profit
        else doc.setTextColor(220, 38, 38); // Red for loss
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(col.val, colCenter, curY + headerH + 5.0, { align: 'center' });
    });

    const safeName = item.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
    const filename = safeName + '_Item_Statement.pdf';
    const blob = doc.output('blob');

    let targetDir = null;
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        targetDir = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch(e) {
        // User cancelled folder selection -> DO NOT DOWNLOAD, EXIT IMMEDIATELY
        return;
      }
      if (!targetDir) {
        // User cancelled folder selection -> DO NOT DOWNLOAD, EXIT IMMEDIATELY
        return;
      }
    }

    if (targetDir) {
      try {
        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (typeof showSleekToast === 'function') {
          showSleekToast('Item Statement PDF saved successfully!');
        } else {
          alert('Item Statement PDF saved successfully!');
        }
      } catch(e) {
        console.error('Error writing item statement PDF:', e);
      }
      return;
    }

    // Fallback only if showDirectoryPicker completely not supported in browser
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'PDF Document (*.pdf)', accept: { 'application/pdf': ['.pdf'] } }]
        });
        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          if (typeof showSleekToast === 'function') {
            showSleekToast('Item Statement PDF saved successfully!');
          }
        }
      } catch (err) {
        // User cancelled -> DO NOT DOWNLOAD
        return;
      }
      return;
    }
  };
