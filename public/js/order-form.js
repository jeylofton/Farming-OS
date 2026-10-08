// Order form: add/remove produce lines, cap quantity at stock, live totals. The server re-checks everything.
(function () {
  const form = document.getElementById('orderForm');
  const rows = document.getElementById('rows');
  const tpl = document.getElementById('rowTpl');
  if (!form || !rows || !tpl) return;
  const taxRate = Number(form.dataset.tax) || 0;
  const money = (n) => '$' + n.toFixed(2);

  function recalc() {
    let subtotal = 0;
    rows.querySelectorAll('.item-row').forEach((row) => {
      const q = Number(row.querySelector('.qty').value) || 0;
      const p = Number(row.querySelector('.price').value) || 0;
      const line = Math.round(q * p * 100) / 100;
      row.querySelector('.line-total').textContent = money(line);
      subtotal += line;
    });
    const tax = Math.round(subtotal * taxRate) / 100;
    document.getElementById('subtotal').textContent = money(subtotal);
    document.getElementById('tax').textContent = money(tax);
    document.getElementById('total').textContent = money(subtotal + tax);
  }

  function addRow() {
    const row = tpl.content.firstElementChild.cloneNode(true);
    rows.appendChild(row);
    const lot = row.querySelector('.lot');
    const qty = row.querySelector('.qty');
    const price = row.querySelector('.price');
    lot.addEventListener('change', () => {
      const o = lot.selectedOptions[0];
      price.value = o && o.dataset.price ? o.dataset.price : '';
      qty.max = o && o.dataset.max ? o.dataset.max : '';
      row.querySelector('.unit').textContent = o && o.dataset.unit ? '(' + o.dataset.unit + ')' : '';
      recalc();
    });
    qty.addEventListener('input', () => { if (qty.max && Number(qty.value) > Number(qty.max)) qty.value = qty.max; recalc(); });
    price.addEventListener('input', recalc);
    row.querySelector('.rm').addEventListener('click', () => { row.remove(); recalc(); });
  }

  document.getElementById('addRow').addEventListener('click', addRow);
  addRow();
})();
