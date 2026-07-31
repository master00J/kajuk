function formatMoney(pence, currency = 'gbp') {
  const amount = (Number(pence) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `£${amount.toFixed(2)}`;
  }
}

function poundsToPence(pounds) {
  return Math.round(Number(pounds) * 100);
}

module.exports = { formatMoney, poundsToPence };
