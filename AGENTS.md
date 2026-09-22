The project contains a dashboard card for home assistent. the project can be added as a custom repository to hacs.


It is a lovelace card showing heatpump sensors and displaying with a graphical representation using the flows and sensor parameters.
the card supports sections and all sensors are grouped into their respective sections.

the sensors match mainly the vitocal 250-a heatpump by viessmann.

## configuration
there is a sample config showing a fully configured heatpump card with all sections under "open3e-heatpump-card.yaml". this card contains no SERIAL number of the heatpump.
for testing there is also a fully configured version of the same configuration named "open3e-heatpump-card-with-serial.yaml". this config is not commited to git as it contains a private serial number.

# configuation changes
if changes are made to the "open3e-heatpump-card.yaml" these changes also need to be applied to the "open3e-heatpump-card-with-serial.yaml".

