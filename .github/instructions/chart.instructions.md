

## chartService

ChartService 读取 measurement blocks / curves / metrics。
它负责生成可绘制曲线和 chart display model。
它不重新判断 raw table block。
它不把 zoom/legend/selected curve 等 view state 写进 FileRecord。

CurveRecord = canonical domain data
ChartDisplayState = view/service display state