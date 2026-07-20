UPDATE `dictionary_categories`
SET `category_name` = '合同币种',
    `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `category_code` = 'CURRENCY'
  AND `category_name` <> '合同币种';
