slice based on the template
---
description: This file is used to slice one file into multiple files based on the template.
applyTo: **/*.ts, **/*.js
---

To slice a file based on a template, follow these steps:
1. Create a template file that defines the structure of the sliced files. The template file should contain placeholders for the content that will be replaced during slicing.
2. In the file you want to slice, add markers to indicate where the content should be
sliced. These markers should match the placeholders in the template file.
3. Use a slicing tool or script to process the file and generate the sliced files based on the template. The tool will replace the placeholders in the template with the corresponding content from the original file, creating new files for each slice.
4. Review the generated files to ensure that the slicing was
performed correctly and that the content is organized as expected. Make any necessary adjustments to the template or the original file if needed.
5. Once you are satisfied with the sliced files, you can integrate them into your project as needed. This may involve updating import statements or references to the sliced content in other parts of your codebase.
6. Finally, maintain the sliced files by keeping the template and original file up to date. Whenever you make changes to the original file, remember to re-run the slicing process to ensure that the sliced files remain consistent with the latest changes.


## UI

----------------------------------------------------------
[slice.icon] slice                            [close.icon]
----------------------------------------------------------
 [slice target]                               inputbox
 [template selector]                          selectbox
 [storage path]                               inputbox
 [file prefix name]                           inputbox
 [if the original file kept]                  switch
 [expected number of slices]                  label
                                            [slice button]
----------------------------------------------------------

- The "slice target" input box is where you specify the file that you want to slice. always trigered by right clicking on the file in the file explorer and selecting "Slice" from the context menu.
- The "template selector" select box allows you to choose the template that will be used for slicing the file. This should list all available templates that you have created for slicing.
- The "storage path" input box is where you specify the directory where the sliced files will be saved. This should be a valid path on your file system where you have write permissions.
- The "file prefix name" input box allows you to specify a prefix for the names of the sliced files. This can help you organize the sliced files and make it easier to identify them in your project. The sliced files will be named using the format: [file prefix name]_[slice number].ts (or .js depending on the file type).
- The "expected number of slices" label displays the number of slices that will be generated based on the markers in the original file and the structure defined in the template. This should update dynamically as you select a template and specify the file to be sliced.
- The "slice button" is the action button that initiates the slicing process. When you click this button, the tool will read the original file, apply the selected template, and generate the sliced files in the specified storage path with the appropriate naming convention. Make sure to review the generated files after slicing to ensure that they are correct and organized as expected.


## attentions
- when the file is sliced, the original file will be deleted, so make sure to back up the original file before slicing if you want to keep it.
- The "if the original file kept" switch allows you to choose whether to keep the original file after slicing. If this switch is turned on, the original file will be preserved; if it is turned off, the original file will be deleted after slicing. Make sure to set this switch according to your preference before initiating the slicing process.
