
- 文件级调用图，每个节点标注了调用文件名
```mermaid
flowchart TB
  %% ============ 触发源 ============
  subgraph SRC["触发源"]
    U["用户修改配置<br/>explorer.decorations.colors / explorer.decorations.badges"]
    W["workspace folders 变化"]
    F["ExplorerDataSource.getChildren() 取子节点失败<br/>root error / resolve failure"]
    R["tree 重新渲染 / resource 变化"]
  end

  %% ============ Explorer View ============
  subgraph VIEW["ExplorerView / ExplorerViewer"]
    EV1["ExplorerView.setTreeInput()"]
    EV2["tree 初次就绪后<br/>注册 ExplorerDecorationsProvider"]
    EV3["onConfigurationUpdated()<br/>decorations 配置变化 -> refresh(true)"]
    EV4["renderStat(stat)"]
    EV5["label.setResource(resource, { fileDecorations })"]
  end

  %% ============ Provider ============
  subgraph PROVIDER["ExplorerDecorationsProvider"]
    P1["constructor 监听 workspace folders"]
    P2["constructor 监听 explorerRootErrorEmitter"]
    P3["provideDecorations(resource)"]
    P4["findClosest(resource) -> ExplorerItem"]
    P5["provideDecorations(fileStat)<br/>规则转换为 IDecorationData"]
  end

  subgraph RULES["provideDecorations(fileStat) 规则"]
    PR1["root && error<br/>tooltip = Unable to resolve...<br/>letter = !<br/>color = listInvalidItemForeground"]
    PR2["isSymbolicLink<br/>tooltip = Symbolic Link<br/>letter = ⤷"]
    PR3["isUnknown<br/>tooltip = Unknown File Type<br/>letter = ?"]
    PR4["isExcluded<br/>color = listDeemphasizedForeground"]
  end

  %% ============ Decorations Service ============
  subgraph SERVICE["DecorationsService"]
    S1["registerDecorationsProvider(provider)"]
    S2["provider 列表 + URI 缓存"]
    S3["provider.onDidChange(uris)"]
    S4["getDecoration(uri, includeChildren)"]
    S5["如果 includeChildren=true<br/>合并 bubble 子节点装饰"]
    S6["onDidChangeDecorations"]
  end

  %% ============ Labels / Rendering ============
  subgraph LABEL["ResourceLabels / ResourceLabelWidget"]
    L1["监听 decorationsService.onDidChangeDecorations"]
    L2["notifyFileDecorationsChanges(e)"]
    L3["命中当前 resource -> rerender"]
    L4["根据 IDecoration 生成<br/>color / badge / icon / tooltip / strikethrough"]
  end

  %% ============ 连接 ============
  U --> EV3
  EV3 --> EV1
  EV1 --> EV2
  EV2 --> S1

  W --> P1
  F --> P2
  R --> EV1

  P1 --> S6
  P2 --> S6

  EV4 --> EV5 --> L4
  L4 --> S4

  S1 --> S2
  S3 --> S2
  S2 --> S4
  S4 -->|cache miss / async fetch| P3
  P3 --> P4 --> P5
  P5 --> PR1
  P5 --> PR2
  P5 --> PR3
  P5 --> PR4
  P5 --> S2
  S2 --> S6

  S6 --> L1 --> L2 --> L3 --> EV5
```



```mermaid
flowchart TB
  subgraph A["视图装配"]
    A1["explorerViewlet.ts<br/>注册 ExplorerViewlet / ViewContainer"]
    A2["explorerView.ts<br/>创建 ExplorerView"]
    A3["explorerViewer.ts<br/>渲染 tree 节点"]
  end

  subgraph B["装饰提供层"]
    B1["explorerDecorationsProvider.ts<br/>ExplorerDecorationsProvider"]
    B2["explorerDecorationsProvider.ts<br/>provideDecorations(fileStat)"]
    B3["explorerViewer.ts<br/>explorerRootErrorEmitter"]
  end

  subgraph C["装饰服务层"]
    C1["decorations.ts<br/>IDecorationsService / IDecorationsProvider"]
    C2["decorationsService.ts<br/>DecorationsService.registerDecorationsProvider()"]
    C3["decorationsService.ts<br/>DecorationsService.getDecoration()"]
    C4["decorationsService.ts<br/>onDidChangeDecorations"]
  end

  subgraph D["标签渲染层"]
    D1["labels.ts<br/>ResourceLabels"]
    D2["labels.ts<br/>ResourceLabelWidget"]
    D3["labels.ts<br/>notifyFileDecorationsChanges()"]
  end

  subgraph E["Explorer 数据层"]
    E1["explorerService.ts<br/>ExplorerService"]
    E2["explorerModel.ts<br/>ExplorerModel / ExplorerItem"]
    E3["explorerViewer.ts<br/>ExplorerDataSource.getChildren()"]
  end

  subgraph F["配置层"]
    F1["files.contribution.ts<br/>explorer.decorations.colors"]
    F2["files.contribution.ts<br/>explorer.decorations.badges"]
    F3["explorerView.ts<br/>onConfigurationUpdated()"]
  end

  A1 --> A2 --> A3
  A3 -->|setTreeInput 完成后注册| B1
  B1 --> B2
  B2 --> E1
  E1 --> E2
  E3 -->|root resolve 失败| B3
  B3 --> B1

  B1 -->|注册 provider| C2
  C2 --> C3
  C2 --> C4
  C4 --> D1

  A3 -->|renderStat()| D2
  D2 -->|setResource(resource, options)| C3
  C3 -->|返回 IDecoration| D2
  C4 --> D3 --> D2

  F1 --> F3
  F2 --> F3
  F3 -->|refresh(true)| A2
  ```