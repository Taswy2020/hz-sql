document.addEventListener('DOMContentLoaded', function () {
  // 初始化 clipboard.js
  var clipboard = new ClipboardJS('.copy-btn');

  clipboard.on('success', function (e) {
    console.info('Action:', e.action);
    console.info('Text:', e.text);
    alert('代码已复制到剪贴板！');
  });

  clipboard.on('error', function (e) {
    console.error('Action:', e.action);
    console.error('Trigger:', e.trigger);
    alert('复制失败，请手动复制。');
  });
});

const app = new Vue({
  el: '#app',
  data: {
    tableName: 'yb_fymxxx',
    templateName: 'repeated',
    repeated: {
      period: 'TRUNC(t.cost_time) = TRUNC(a.cost_time)',
      code: '',
      normalCodes: '',
      diagnose: '',
      regexp_like_logic: 'not',
      formattedSQL:'',
      source: `
        SELECT t.*,
        (CASE WHEN t.item_code in ({{{rep_code}}}) THEN t.money END) AS money_rules
        FROM {{table_name}} t
        WHERE EXISTS
          (SELECT 1
          FROM {{table_name}} a
          WHERE a.pay_per_retio < 1
            AND a.item_code in ({{{rep_code}}})
            AND t.bill_id = a.bill_id
            AND {{{ join_time }}}
            AND t.medical_code = a.medical_code)
        AND EXISTS
          (SELECT 1
          FROM {{table_name}} a
          WHERE a.item_code in
              ({{{gen_codes}}})
            AND t.bill_id = a.bill_id
            AND {{{ join_time }}}
            AND t.medical_code = a.medical_code)
        AND ((t.item_code in ({{{rep_code}}})
        {{#if diagnose}}
        and {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
          '{{{diagnose}}}')
        {{/if}}
        AND t.pay_per_retio < 1)
          OR t.item_code in
          ({{{gen_codes}}}))
      `
    },
    excessive: {
      period: 'TRUNC(t.cost_time)',
      code: '',
      num: 1,
      diagnose: '',
      regexp_like_logic: 'not',
      formattedSQL: '',
      source: `
    SELECT t.*,
       CASE
           WHEN total_count > {{num}} AND row_num = 1
               THEN (total_count - {{num}}) * t.unit_price
           ELSE NULL END money_rules
  FROM (SELECT t.*,
              ROW_NUMBER() OVER (PARTITION BY medical_code, bill_id,item_code,
                {{{ period}}} ORDER BY medical_code, bill_id, {{{ period}}} )  row_num,
              SUM(num)
                  OVER (PARTITION BY medical_code, bill_id, item_code, 
                    {{{ period}}} ) total_count
        FROM {{table_name}} t
        WHERE item_code in ({{{codes}}})
        {{#if diagnose}}
        and {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
          '{{{diagnose}}}')
        {{/if}}
          AND pay_per_retio <> 1) t
  WHERE total_count > {{num}} 
    `,
    },
    rise: {
      code: '',
      price: null,
      diagnose: '',
      regexp_like_logic: 'not',
      formattedSQL: '',
      source: `
      SELECT t.*, (t.unit_price - {{price}}) * t.num money_rules
      FROM {{table_name}} t
      WHERE t.item_code in  ({{{codes}}})
        AND t.unit_price > {{price}}
        {{#if diagnose}}
        AND {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
          '{{{diagnose}}}')
        {{/if}}
        AND t.pay_per_retio < 1
    `,
        },
    swapping: {
      code: '',
      diagnose: '',
      regexp_like_logic: 'not',
      formattedSQL: '',
      source: `
      SELECT t.*, t.money money_rules
      FROM {{table_name}} t
      WHERE t.item_code in  ({{{codes}}})
      {{#if diagnose}}
      AND {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
        '{{{diagnose}}}')
      {{/if}}
        AND t.pay_per_retio < 1
    `,
    },
    navItems: [
      { id: 1, text: '重复收费', value: 'repeated' },
      { id: 2, text: '超标准收费(量)', value: 'excessive' },
      { id: 3, text: '超标准收费(价)', value: 'rise' },
      { id: 4, text: '串换项目/不纳入医保范围', value: 'swapping' }
    ], 
  },
  methods: {
    setTemplateName(name) {
      this.templateName = name;
    },

    formatStringArray(input) {
      // 格式化数组逻辑
      // 中文逗号替换为半角
      var array = input.replace(/，/g, ',');
      // 将字符串通过逗号分割成数组
      var array = array.split(',');
      // 移除空格并过滤掉空字符串
      var formattedArray = array.map(function (item) {
        return item.trim();
      }).filter(function (item) {
        return item !== '';
      });
      // 为每个元素增加单引号
      var quotedArray = formattedArray.map(function (item) {
        return "'" + item + "'";
      });
      // 使用逗号重新拼接字符串
      var result = quotedArray.join(',');
      return result;
    },

    formatDiagnoseStringArray(input) {
      // 格式化数组逻辑
      // 中文逗号替换为半角
      var array = input.replace(/，/g, ',');
      // 将字符串通过逗号分割成数组
      var array = array.split(/,(?=\w)|(?:\|)(?=\w)/);
      // 移除空格并过滤掉空字符串
      var formattedArray = array.map(function (item) {
        return item.trim();
      }).filter(function (item) {
        return item !== '';
      });
      // 使用|重新拼接字符串
      var result = formattedArray.join('|');
      return result;
    },

    generateSQL() {
      if (this.templateName === 'repeated') {
        const context = {
          rep_code: this.formatStringArray(this.repeated.code), 
          table_name: this.tableName, 
          join_time: this.repeated.period,
          gen_codes: this.formatStringArray(this.repeated.normalCodes),
          regexp_like_logic: this.repeated.regexp_like_logic,
          diagnose: this.formatDiagnoseStringArray(this.repeated.diagnose)
        }
        const template = Handlebars.compile(this.repeated.source);
        const result = template(context);
        this.repeated.formattedSQL = sqlFormatter.format(result);
      } 
      else if (this.templateName === 'excessive') {
        const context = {
          codes: this.formatStringArray(this.excessive.code),
          table_name: this.tableName, 
          num: this.excessive.num,
          period: this.excessive.period,
          regexp_like_logic: this.excessive.regexp_like_logic,
          diagnose: this.formatDiagnoseStringArray(this.excessive.diagnose)
        }
        const template = Handlebars.compile(this.excessive.source);
        const result = template(context);
        this.excessive.formattedSQL = sqlFormatter.format(result);
      }
      else if (this.templateName === 'rise') {
        if( this.rise.price == null ) {
          alert("标准价格不能为空！")
          return;
        }
        const context = {
          codes: this.formatStringArray(this.rise.code),
          table_name: this.tableName, 
          price: this.rise.price,
          regexp_like_logic: this.rise.regexp_like_logic,
          diagnose: this.formatDiagnoseStringArray(this.rise.diagnose)
        }
        const template = Handlebars.compile(this.rise.source);
        const result = template(context);
        this.rise.formattedSQL = sqlFormatter.format(result);
      }
      else if (this.templateName === 'swapping') {
        const context = {
          codes: this.formatStringArray(this.swapping.code),
          table_name: this.tableName, 
          regexp_like_logic: this.swapping.regexp_like_logic,
          diagnose: this.formatDiagnoseStringArray(this.swapping.diagnose)
        }
        const template = Handlebars.compile(this.swapping.source);
        const result = template(context);
        this.swapping.formattedSQL = sqlFormatter.format(result);
      }
    },

    clear() {
      if (this.templateName === 'repeated') {
        this.repeated = {
          period: 'TRUNC(t.cost_time) = TRUNC(a.cost_time)',
          code: '',
          normalCodes: '',
          diagnose: '',
          regexp_like_logic: 'not',
          formattedSQL:'',
          source: `
            SELECT t.*,
            (CASE WHEN t.item_code in ({{{rep_code}}}) THEN t.money END) AS money_rules
            FROM {{table_name}} t
            WHERE EXISTS
              (SELECT 1
              FROM {{table_name}} a
              WHERE a.pay_per_retio < 1
                AND a.item_code in ({{{rep_code}}})
                AND t.bill_id = a.bill_id
                AND {{{ join_time }}}
                AND t.medical_code = a.medical_code)
            AND EXISTS
              (SELECT 1
              FROM {{table_name}} a
              WHERE a.item_code in
                  ({{{gen_codes}}})
                AND t.bill_id = a.bill_id
                AND {{{ join_time }}}
                AND t.medical_code = a.medical_code)
            AND ((t.item_code in ({{{rep_code}}})
            {{#if diagnose}}
            and {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
              '{{{diagnose}}}')
            {{/if}}
            AND t.pay_per_retio < 1)
              OR t.item_code in
              ({{{gen_codes}}}))
          `
        }
        
      } 
      else if (this.templateName === 'excessive') {
        this.excessive= {
          period: 'TRUNC(t.cost_time)',
          code: '',
          num: 1,
          diagnose: '',
          regexp_like_logic: 'not',
          formattedSQL: '',
          source: `
        SELECT t.*,
           CASE
               WHEN total_count > {{num}} AND row_num = 1
                   THEN (total_count - {{num}}) * t.unit_price
               ELSE NULL END money_rules
      FROM (SELECT t.*,
                  ROW_NUMBER() OVER (PARTITION BY medical_code, bill_id,item_code,
                    {{{ period}}} ORDER BY medical_code, bill_id, {{{ period}}} )  row_num,
                  SUM(num)
                      OVER (PARTITION BY medical_code, bill_id, item_code, 
                        {{{ period}}} ) total_count
            FROM {{table_name}} t
            WHERE item_code in ({{{codes}}})
            {{#if diagnose}}
            and {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
              '{{{diagnose}}}')
            {{/if}}
              AND pay_per_retio <> 1) t
      WHERE total_count > {{num}} 
        `,
        }
        
      }
      else if (this.templateName === 'rise') {
        this.rise= {
          code: '',
          price: null,
          diagnose: '',
          regexp_like_logic: 'not',
          formattedSQL: '',
          source: `
          SELECT t.*, (t.unit_price - {{price}}) * t.num money_rules
          FROM {{table_name}} t
          WHERE t.item_code in  ({{{codes}}})
            AND t.unit_price > {{price}}
            {{#if diagnose}}
            AND {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
              '{{{diagnose}}}')
            {{/if}}
            AND t.pay_per_retio < 1
        `,
            }
      }
      else if (this.templateName === 'swapping') {
        
        this.swapping = {
          code: '',
          diagnose: '',
          regexp_like_logic: 'not',
          formattedSQL: '',
          source: `
          SELECT t.*, t.money money_rules
          FROM {{table_name}} t
          WHERE t.item_code in  ({{{codes}}})
          {{#if diagnose}}
          AND {{regexp_like_logic}} regexp_like(t.in_diagnose_name||t.out_diagnose_name,
            '{{{diagnose}}}')
          {{/if}}
            AND t.pay_per_retio < 1
        `,}
      }
    },

    onKeyUp(event) {
      if (event.key === 'Enter') {
        this.generateSQL();
      }
    }

  },
  mounted() {
    
  }
});