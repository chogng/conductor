
## searchService

SearchService 订阅 session，消费 snapshot。
它可以搜索 raw cell、measurement group、measurement block、column、parameter、curve。
它的结果统一用 RawTableRangeRef 指回原始表格区域。
它不刷新 canonical data。
它不重新判断 block。